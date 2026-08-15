"use strict";
/* fixtures/pact.js — canned data for `orc ui --fixtures`.
   The invariant ledger, carrying one of each state — BROKEN, DRIFTED,
   UNCHECKABLE, HOLDING.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const pact = {
  ok: true,
  ledger: PROJECT + "/.claude/orc/pact/ledger.json",
  doc: PROJECT + "/PACT.md",
  doc_exists: true,
  entries: 5,
  retired: 1,
  counts: { HOLDING: 2, DRIFTED: 1, UNCHECKABLE: 1, BROKEN: 1 },
  line: "pact: 2 holding · 1 drifted · 1 uncheckable · 1 BROKEN",
  rows: [
    {
      id: "PACT-014",
      statement: "A payment is never written to the ledger twice for one idempotency key.",
      origin: { lane: "orc-grill", run: "run-grill-checkout-100826-141130", kind: "constraint" },
      anchors: ["src/payments/ledger.ts:88", "src/payments/idempotency.ts"],
      check: { kind: "test", ref: "npm test -- idempotency" },
      verified_commit: "8a62b4f1c9",
      confidence: "high",
      last_check: { status: "fail", commit: "8a62b4f1c9", at: "09-08-2026 11:20:04", ref: "npm test -- idempotency" },
      // A real-looking failure, not a placeholder: the panel has to lay out a
      // multi-line check output that does not fit its card.
      history: [
        { at: "09-08-2026 11:20:04", status: "fail", commit: "8a62b4f1c9" },
        { at: "02-08-2026 09:14:51", status: "pass", commit: "c273793aa1" },
      ],
      retired: false,
      state: "BROKEN",
      why: "check failed at 8a62b4f1 (09-08-2026 11:20:04)",
      distance: 3,
    },
    {
      id: "PACT-002",
      statement: "Refund windows are configured, never hardcoded.",
      origin: { lane: "orc-brainstorm", run: "run-brainstorm-refunds-010826-101010", kind: "constraint" },
      anchors: ["src/billing/refund.ts"],
      check: { kind: "grep", ref: "REFUND_WINDOW_DAYS" },
      verified_commit: "c273793aa1",
      confidence: "medium",
      last_check: { status: "pass", commit: "c273793aa1", at: "01-08-2026 10:11:02", ref: "REFUND_WINDOW_DAYS" },
      history: [{ at: "01-08-2026 10:11:02", status: "pass", commit: "c273793aa1" }],
      retired: false,
      state: "DRIFTED",
      why: "6 commits since c273793a touched 1 anchored file",
      distance: 6,
    },
    {
      id: "PACT-007",
      statement: "The admin export never contains a raw email address.",
      origin: { lane: "user", run: null, kind: "constraint" },
      anchors: ["src/admin/export.ts"],
      check: { kind: "manual", ref: null },
      verified_commit: "783f6971aa",
      confidence: "low",
      last_check: null,
      history: [],
      retired: false,
      state: "UNCHECKABLE",
      // The long day count: an UNCHECKABLE promise nobody has looked at for
      // months is the case this state exists to make visible.
      why: "no cheap check exists — this promise is held by review, not by a runner",
      distance: null,
    },
    {
      id: "PACT-001",
      statement: "Every outbound webhook is signed with the tenant's current secret.",
      origin: { lane: "orc", run: "run-orc-webhooks-120726-084500", kind: "constraint" },
      anchors: ["src/webhooks/sign.ts:40"],
      check: { kind: "command", ref: "npm run test:webhooks" },
      verified_commit: "e9dad01bb2",
      confidence: "high",
      last_check: { status: "pass", commit: "e9dad01bb2", at: "05-08-2026 16:02:11", ref: "npm run test:webhooks" },
      history: [{ at: "05-08-2026 16:02:11", status: "pass", commit: "e9dad01bb2" }],
      retired: false,
      state: "HOLDING",
      why: "verified at e9dad01b; no commit since has touched its anchors",
      distance: 0,
    },
    {
      id: "PACT-009",
      statement: "Session cookies are always SameSite=Lax.",
      origin: { lane: "orc-grill", run: "run-grill-auth-200626-113000", kind: "constraint" },
      anchors: ["src/auth/session.ts"],
      check: { kind: "grep", ref: "SameSite=Lax" },
      verified_commit: "cc4778e0aa",
      confidence: "high",
      last_check: { status: "pass", commit: "cc4778e0aa", at: "21-06-2026 09:00:00", ref: "SameSite=Lax" },
      history: [{ at: "21-06-2026 09:00:00", status: "pass", commit: "cc4778e0aa" }],
      retired: false,
      state: "HOLDING",
      why: "verified at cc4778e0; no commit since has touched its anchors",
      distance: 0,
    },
  ],
};

module.exports = { pact };
