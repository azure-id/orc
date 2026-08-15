"use strict";
/* fixtures/handoff.js — canned data for `orc ui --fixtures`.
   Editable surfaces at all three grades. RED exists so the no-button-at-all
   rule is visible rather than remembered.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const handoff = {
  ok: true,
  map: PROJECT + "/orc-handoff/surfaces.md",
  map_exists: true,
  write_enabled: true,
  counts: { green: 4, amber: 1, red: 2 },
  surfaces: [
    { id: "H-001", file: "web/locales/en.json", what: "Screen text", fields: {}, grade: "green", check: "npm run i18n:check", check_kind: "command", revert: "git checkout -- web/locales/en.json", reason: null, ask: null, exists: true },
    { id: "H-002", file: "web/locales/id.json", what: "Screen text (Indonesian)", fields: {}, grade: "green", check: "npm run i18n:check", check_kind: "command", revert: "git checkout -- web/locales/id.json", reason: null, ask: null, exists: true },
    { id: "H-003", file: "content/pricing.md", what: "The pricing page", fields: { upgrade: "a link checker would make this green" }, grade: "amber", check: "open /pricing in the app and read the page", check_kind: "manual", revert: "git checkout -- content/pricing.md", reason: null, ask: null, exists: true },
    { id: "H-004", file: "config/features.yaml", what: "Feature switches", fields: {}, grade: "green", check: "npm run validate:flags", check_kind: "command", revert: "git checkout -- config/features.yaml", reason: null, ask: null, exists: true },
    // A GREEN surface whose check FAILS. The panel must be able to render the
    // failure and the undo command without it reading as "your edit was saved".
    { id: "H-005", file: "content/faq.md", what: "The FAQ page", fields: { last_check: "fail" }, grade: "green", check: "npm run lint:content", check_kind: "command", revert: "git checkout -- content/faq.md", reason: null, ask: null, exists: true },
    { id: "H-006", file: "src/config/limits.ts", what: "Looks like settings, is code", fields: {}, grade: "red", check: null, check_kind: "manual", revert: "git checkout -- src/config/limits.ts", reason: "this file decides how much a customer is charged", ask: "a backend developer", exists: true },
    { id: "H-007", file: "db/seeds/tenants.sql", what: "Looks like data, is a migration input", fields: {}, grade: "red", check: null, check_kind: "manual", revert: "git checkout -- db/seeds/tenants.sql", reason: "this file is replayed into production on every deploy", ask: "the data owner", exists: true },
  ],
};

module.exports = { handoff };
