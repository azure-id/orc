"use strict";
/* fixtures/crosslink.js — canned data for `orc ui --fixtures`.
   The peer graph, with enough nodes to exercise ringRadii's spacing.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const crosslink = {
  configured: true,
  self: "checkout-api",
  config_path: PROJECT + "/.claude/orc-crosslink.config.yaml",
  nodes: [
    { name: "payments-core", repo_path: "../payments-core", resolved_path: "/example/payments-core", kinds: ["http", "auth/oidc"], direction: "consume", provider: { state: "wiki", last_scan: "2026-07-28", tier: "FRESH", distance: 4, tags: 11 } },
    { name: "storefront-web", repo_path: "../storefront-web", resolved_path: "/example/storefront-web", kinds: ["http"], direction: "provide", provider: { state: "wiki", last_scan: "2026-03-02", tier: "STALE", distance: 210, tags: 0 } },
    { name: "ledger-batch", repo_path: "../ledger-batch", resolved_path: "/example/ledger-batch", kinds: ["events"], direction: "none", provider: { state: "missing" } },
  ],
  links: [
    { from: "self", to: "payments-core", via: "http", relation: "we-call" },
    { from: "storefront-web", to: "self", via: "http", relation: "they-call-us" },
  ],
  needs_baseline: PROJECT + "/.claude/orc/crosslink/needs.json",
};

module.exports = { crosslink };
