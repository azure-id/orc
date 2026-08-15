"use strict";
/* fixtures/challenge.js — canned data for `orc ui --fixtures`.
   A rich multi-cycle challenge plus the empty and MISSING-REVISION states.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const chGoals = (goal, audience, done, version) => ({
  version: version || 1,
  goal,
  audience,
  done_means: done,
  out_of_scope: ["the mobile client", "the 2027 ledger migration"],
  context_refs: ["JIRA-4412", "docs/adr/0009-idempotency.md"],
});

const chDims = (rows) => rows;

const challengeCycles = {
  // The rich one: an accepted exception, an OPEN rebuttal, and a `regoal` version
  // break in the middle of the convergence chart.
  "tsd-payments": {
    ok: true,
    slug: "tsd-payments",
    state: "AWAITING-RECHECK",
    why: "the artifact moved since the last verdict — a new iteration is warranted",
    stalled: false,
    no_template: false,
    kind: "tsd",
    goals: chGoals(
      "a backend team implements this without asking me anything",
      "backend engineers, 2 of 5 non-native English readers",
      "no open interface question and no TBD in §3–§7",
      2
    ),
    template: { source: "docs/templates/tsd.md", frozen: "template.md", sha: "0c8e41", version: 1, no_template: false },
    iterations: 3,
    artifacts: [{ path: "docs/tsd-payments.md", changed_since_verdict: true }],
    revision: { mode: "new-file", pattern: "docs/tsd-payments-v{n}.md", expected: "docs/tsd-payments-v4.md", found: true },
    counts: { P0: 0, P1: 3, P2: 5, P3: 2, accepted: 1, rebutted: 1 },
    dimensions: chDims([
      { id: "D1", status: "CHECKED", findings: 1 },
      { id: "D2", status: "CHECKED", findings: 2 },
      { id: "D3", status: "CHECKED", findings: 0 },
      { id: "D4", status: "CHECKED", findings: 3, score: "8/12" },
      { id: "D5", status: "CHECKED", findings: 4 },
      { id: "D6", status: "CHECKED", findings: 1 },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [
      { n: 1, blocking: 9, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 2, P1: 7, P2: 6, P3: 1 } },
      { n: 2, blocking: 5, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 1, P1: 4, P2: 5, P3: 2 } },
      { n: 3, blocking: 3, passed: false, graded_against: 1, graded_against_goal: 2, severities: { P0: 0, P1: 3, P2: 5, P3: 2 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/tsd-payments",
    next: "/orc-challenge tsd-payments",
    preflight_line: "challenge: tsd-payments AWAITING-RECHECK — 3 blocking findings open",
  },
  // Stalled: four iterations, no net reduction. The warning is not chrome.
  "checkout-prd": {
    ok: true,
    slug: "checkout-prd",
    state: "AWAITING-FIX",
    why: "4 blocking findings open and nothing has changed yet",
    stalled: true,
    no_template: false,
    kind: "prd",
    goals: chGoals(
      "it survives the architecture review board on Tuesday",
      "the review board — two principals, one PM, none of them close to this code",
      "no section contradicts another, and every claim has a source"
    ),
    template: { source: "docs/templates/prd.md", frozen: "template.md", sha: "77aa10", version: 2, no_template: false },
    iterations: 4,
    artifacts: [{ path: "docs/checkout-prd.md", changed_since_verdict: false }],
    revision: { mode: "in-place", pattern: null, expected: "docs/checkout-prd.md", found: true },
    counts: { P0: 0, P1: 4, P2: 2, P3: 0, accepted: 0, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "CHECKED", findings: 2 },
      { id: "D2", status: "NOT-SELECTED" },
      { id: "D3", status: "CHECKED", findings: 2 },
      { id: "D4", status: "CHECKED", findings: 0, score: "11/12" },
      { id: "D5", status: "CHECKED", findings: 0 },
      { id: "D6", status: "CHECKED", findings: 2 },
      { id: "D7", status: "CHECKED", findings: 0 },
    ]),
    convergence: [
      { n: 1, blocking: 9, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 1, P1: 8, P2: 3, P3: 0 } },
      { n: 2, blocking: 4, passed: false, graded_against: 2, graded_against_goal: 1, severities: { P0: 0, P1: 4, P2: 3, P3: 1 } },
      { n: 3, blocking: 4, passed: false, graded_against: 2, graded_against_goal: 1, severities: { P0: 0, P1: 4, P2: 2, P3: 0 } },
      { n: 4, blocking: 4, passed: false, graded_against: 2, graded_against_goal: 1, severities: { P0: 0, P1: 4, P2: 2, P3: 0 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/checkout-prd",
    next: "/orc-challenge checkout-prd",
    preflight_line: "challenge: checkout-prd AWAITING-FIX — 4 blocking findings open · stalled",
  },
  // Zero iterations. "Created, not yet judged" is an ANSWER, not a blank card.
  "runbook-oncall": {
    ok: true,
    slug: "runbook-oncall",
    state: "AWAITING-JUDGE",
    why: "created, not yet judged",
    stalled: false,
    no_template: false,
    kind: "runbook",
    goals: chGoals(
      "somebody woken at 3am can follow it without asking anyone",
      "the on-call rota — anyone in the backend group, including week-one joiners",
      "every step has a command and an expected result"
    ),
    template: { source: "docs/templates/runbook.md", frozen: "template.md", sha: "b0c110", version: 1, no_template: false },
    iterations: 0,
    artifacts: [{ path: "docs/runbooks/oncall.md", changed_since_verdict: false }],
    revision: { mode: "in-place", pattern: null, expected: "docs/runbooks/oncall.md", found: true },
    counts: { P0: 0, P1: 0, P2: 0, P3: 0, accepted: 0, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "NOT-CHECKED", reason: "not yet judged" },
      { id: "D2", status: "NOT-SELECTED" },
      { id: "D3", status: "NOT-CHECKED", reason: "not yet judged" },
      { id: "D4", status: "NOT-CHECKED", reason: "not yet judged" },
      { id: "D5", status: "NOT-CHECKED", reason: "not yet judged" },
      { id: "D6", status: "NOT-CHECKED", reason: "not yet judged" },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [],
    dir: PROJECT + "/orc/orc-challenge/runbook-oncall",
    next: "/orc-challenge runbook-oncall",
    preflight_line: "challenge: runbook-oncall AWAITING-JUDGE",
  },
  "adr-0012-events": {
    ok: true,
    slug: "adr-0012-events",
    state: "PASSED",
    why: "passed at iteration 2; nothing has changed since",
    stalled: false,
    no_template: false,
    kind: "adr",
    goals: chGoals(
      "a future maintainer understands why we chose the outbox over dual writes",
      "whoever inherits this service in two years",
      "the rejected options are written down with the reason each lost"
    ),
    template: { source: "docs/adr/0001-template.md", frozen: "template.md", sha: "33ee90", version: 1, no_template: false },
    iterations: 2,
    artifacts: [{ path: "docs/adr/0012-events.md", changed_since_verdict: false }],
    revision: { mode: "in-place", pattern: null, expected: "docs/adr/0012-events.md", found: true },
    counts: { P0: 0, P1: 0, P2: 1, P3: 2, accepted: 0, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "CHECKED", findings: 0 },
      { id: "D2", status: "CHECKED", findings: 0 },
      { id: "D3", status: "CHECKED", findings: 1 },
      { id: "D4", status: "NOT-SELECTED" },
      { id: "D5", status: "NOT-SELECTED" },
      { id: "D6", status: "NOT-SELECTED" },
      { id: "D7", status: "CHECKED", findings: 2 },
    ]),
    convergence: [
      { n: 1, blocking: 4, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 1, P1: 3, P2: 2, P3: 1 } },
      { n: 2, blocking: 0, passed: true, graded_against: 1, graded_against_goal: 1, severities: { P0: 0, P1: 0, P2: 1, P3: 2 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/adr-0012-events",
    next: null,
    preflight_line: "challenge: adr-0012-events PASSED",
  },
  // Passed, then somebody edited it. HONEST, not a failure — the UNCHECKABLE
  // precedent from /orc-pact.
  "api-contract-v2": {
    ok: true,
    slug: "api-contract-v2",
    state: "STALE-PASS",
    why: "passed at iteration 3, but 1 artifact changed afterwards — honest, not a failure",
    stalled: false,
    no_template: false,
    kind: "api-contract",
    goals: chGoals(
      "the mobile and web clients can both generate from it with no questions",
      "client engineers on two platforms, generating from the spec",
      "every endpoint has an error schema and an example"
    ),
    template: { source: "openapi/base.yaml", frozen: "template.md", sha: "9a7712", version: 1, no_template: false },
    iterations: 3,
    artifacts: [{ path: "openapi/payments-v2.yaml", changed_since_verdict: true }],
    revision: { mode: "in-place", pattern: null, expected: "openapi/payments-v2.yaml", found: true },
    counts: { P0: 0, P1: 0, P2: 0, P3: 1, accepted: 2, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "CHECKED", findings: 0 },
      { id: "D2", status: "CHECKED", findings: 0 },
      { id: "D3", status: "CHECKED", findings: 0 },
      { id: "D4", status: "NOT-SELECTED" },
      { id: "D5", status: "NOT-SELECTED" },
      { id: "D6", status: "CHECKED", findings: 1 },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [
      { n: 1, blocking: 12, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 3, P1: 9, P2: 4, P3: 2 } },
      { n: 2, blocking: 5, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 0, P1: 5, P2: 3, P3: 1 } },
      { n: 3, blocking: 0, passed: true, graded_against: 1, graded_against_goal: 1, severities: { P0: 0, P1: 0, P2: 0, P3: 1 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/api-contract-v2",
    next: "/orc-challenge api-contract-v2",
    preflight_line: "challenge: api-contract-v2 STALE-PASS",
  },
  // The declared revision is not where it was declared. Candidates are LISTED.
  "billing-webhooks": {
    ok: true,
    slug: "billing-webhooks",
    state: "MISSING-REVISION",
    why: "the declared revision docs/billing-webhooks-v2.md does not exist — candidates are listed, never adopted",
    stalled: false,
    no_template: false,
    kind: "code",
    goals: chGoals(
      "a new engineer can extend this module without reading the whole service",
      "backend engineers joining the team this quarter",
      "every exported function has a caller-visible contract, and no error path is silent"
    ),
    template: { source: ".claude/orc/patterns/typescript-pattern.md", frozen: "template.md", sha: "51ff02", version: 1, no_template: false },
    iterations: 1,
    artifacts: [{ path: "src/billing/webhooks/handler.ts", changed_since_verdict: false }],
    revision: { mode: "new-file", pattern: "docs/billing-webhooks-v{n}.md", expected: "docs/billing-webhooks-v2.md", found: false },
    counts: { P0: 1, P1: 2, P2: 3, P3: 0, accepted: 0, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "NOT-SELECTED" },
      { id: "D2", status: "CHECKED", findings: 3 },
      { id: "D3", status: "CHECKED", findings: 1 },
      { id: "D4", status: "CHECKED", findings: 2, score: "6/11" },
      { id: "D5", status: "NOT-SELECTED" },
      { id: "D6", status: "CHECKED", findings: 0 },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [
      { n: 1, blocking: 3, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 1, P1: 2, P2: 3, P3: 0 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/billing-webhooks",
    next: "/orc-challenge billing-webhooks",
    preflight_line: "challenge: billing-webhooks MISSING-REVISION — 3 blocking findings open",
  },
  // A verdict file changed after it was recorded. Reported, never re-graded.
  "readme-onboarding": {
    ok: true,
    slug: "readme-onboarding",
    state: "TAMPERED",
    why: "iteration-01/verdict.md changed after it was recorded — reported, never silently re-graded",
    stalled: false,
    no_template: false,
    kind: "readme",
    goals: chGoals(
      "a new hire gets the project running on day one without asking",
      "new joiners, on their own machine, on their first morning",
      "every command in it has been run on a clean checkout"
    ),
    template: { source: "docs/templates/readme.md", frozen: "template.md", sha: "12bb44", version: 1, no_template: false },
    iterations: 2,
    artifacts: [{ path: "README.md", changed_since_verdict: true }],
    revision: { mode: "in-place", pattern: null, expected: "README.md", found: true },
    counts: { P0: 0, P1: 2, P2: 1, P3: 0, accepted: 0, rebutted: 1 },
    dimensions: chDims([
      { id: "D1", status: "CHECKED", findings: 1 },
      { id: "D2", status: "NOT-SELECTED" },
      { id: "D3", status: "CHECKED", findings: 1 },
      { id: "D4", status: "CHECKED", findings: 1, score: "9/12" },
      { id: "D5", status: "CHECKED", findings: 0 },
      { id: "D6", status: "NOT-SELECTED" },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [
      { n: 1, blocking: 6, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 1, P1: 5, P2: 2, P3: 0 } },
      { n: 2, blocking: 2, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 0, P1: 2, P2: 1, P3: 0 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/readme-onboarding",
    next: "/orc-challenge readme-onboarding",
    preflight_line: "challenge: readme-onboarding TAMPERED",
  },
  // No template supplied. D1 is NOT-CHECKED **with its reason**, everywhere —
  // in the verdict, in the report, and as a chip here.
  "mobile-spec": {
    ok: true,
    slug: "mobile-spec",
    state: "AWAITING-FIX",
    why: "2 blocking findings open and nothing has changed yet",
    stalled: false,
    no_template: true,
    kind: "tsd",
    goals: chGoals(
      "I just want to know if I forgot anything obvious",
      "me, and whoever picks this up next quarter",
      "no section is a heading with nothing under it"
    ),
    template: { source: null, frozen: null, sha: null, version: 1, no_template: true },
    iterations: 1,
    artifacts: [{ path: "docs/mobile-spec.md", changed_since_verdict: false }],
    revision: { mode: "in-place", pattern: null, expected: "docs/mobile-spec.md", found: true },
    counts: { P0: 0, P1: 2, P2: 4, P3: 3, accepted: 0, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "NOT-CHECKED", reason: "no template supplied" },
      { id: "D2", status: "CHECKED", findings: 1 },
      { id: "D3", status: "CHECKED", findings: 2 },
      { id: "D4", status: "NOT-CHECKED", reason: "challenge_reader is off" },
      { id: "D5", status: "CHECKED", findings: 4 },
      { id: "D6", status: "CHECKED", findings: 2 },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [
      { n: 1, blocking: 2, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 0, P1: 2, P2: 4, P3: 3 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/mobile-spec",
    next: "/orc-challenge mobile-spec",
    preflight_line: "challenge: mobile-spec AWAITING-FIX — 2 blocking findings open · no template (D1 NOT-CHECKED)",
  },
};

const challengeList = {
  ok: true,
  in_flight: Object.values(challengeCycles).filter((c) => c.state !== "PASSED").length,
  cycles: Object.values(challengeCycles).map((c) => ({
    slug: c.slug,
    kind: c.kind,
    state: c.state,
    why: c.why,
    iterations: c.iterations,
    blocking: c.counts.P0 + c.counts.P1,
    counts: c.counts,
    stalled: c.stalled,
    no_template: c.no_template,
    goal: c.goals.goal,
    next: c.next,
  })),
};

// The findings behind the rich cycle. Enough shapes to design against: a carried
// finding with each outcome, an accepted one, a rebutted one, and one whose
// anchor did not move.

const challengeShow = {
  ok: true,
  slug: "tsd-payments",
  state: "AWAITING-RECHECK",
  kind: "tsd",
  goals: challengeCycles["tsd-payments"].goals,
  template: challengeCycles["tsd-payments"].template,
  no_template: false,
  dimensions_selected: ["D1", "D2", "D3", "D4", "D5", "D6"],
  accepted: { "F-003": { reason: "the endpoints land in the sibling API spec, not here", at: "11-08-2026 16:04:22", iteration: 2 } },
  rebuttals: { "F-014": { reason: "the passive voice is quoted from the regulator's wording", at: "12-08-2026 09:11:03", status: "open" } },
  events: [
    { at: "10-08-2026 14:02:11", kind: "created", detail: "goal v1, template v1" },
    { at: "11-08-2026 16:04:22", kind: "accept", detail: "F-003 — the endpoints land in the sibling API spec, not here" },
    { at: "12-08-2026 08:40:00", kind: "regoal", detail: "docs/goals-v2.md — the board moved to a delivery review", to_version: 2 },
    { at: "12-08-2026 09:11:03", kind: "rebut", detail: "F-014 — the passive voice is quoted from the regulator's wording" },
  ],
  revision: { mode: "new-file", pattern: "docs/tsd-payments-v{n}.md", expected: "docs/tsd-payments-v4.md" },
  iterations: [
    {
      n: 3,
      graded_against: 1,
      graded_against_goal: 2,
      coverage_pct: 100,
      blocking: 3,
      passed: false,
      advised: true,
      lint: { findings: 13, grade: 8.1 },
      reader: { asked: 12, answered: 8, score: "8/12" },
      verdict_file: "iteration-03/verdict.md",
      advice_file: "iteration-03/advice.md",
      severities: { P0: 0, P1: 3, P2: 5, P3: 2 },
      dimensions: challengeCycles["tsd-payments"].dimensions.filter((d) => d.status !== "NOT-SELECTED"),
      findings: [
        {
          id: "F-001",
          dimension: "D2",
          severity: "P1",
          anchor: "docs/tsd-payments.md:118",
          quote: "the idempotency window is applied appropriately",
          what_is_wrong: "the window is never given a value anywhere in the document",
          consequence: "two teams implementing from this will pick different windows, and the mismatch only shows up in production",
          acceptance_line: "§4.2 names the window in seconds and the dead-letter destination",
          serves: "done_means",
          carried: true,
          outcome: "still-open",
          reason: null,
          superseded_by: null,
        },
        {
          id: "F-007",
          dimension: "D5",
          severity: "P1",
          anchor: "docs/tsd-payments.md:84",
          quote: "Once the settlement job has been kicked off, the reconciliation is not run until the window is closed and no further retries are outstanding.",
          what_is_wrong: "43 words, two negations, and a phrasal verb",
          consequence: "the two non-native readers on the team read this three times and still ask",
          acceptance_line: "the sentence is split, and 'kicked off' becomes 'started'",
          serves: "audience",
          carried: true,
          outcome: "still-open",
          reason: null,
          superseded_by: null,
        },
        {
          id: "F-011",
          dimension: "D1",
          severity: "P1",
          anchor: "docs/tsd-payments.md:1",
          quote: "(the section is absent)",
          what_is_wrong: "the template requires an Error handling section and there is none",
          consequence: "every error path is undecided, so the implementer invents one per endpoint",
          acceptance_line: "an Error handling section exists with one row per failure mode",
          serves: "goal",
          carried: false,
          outcome: null,
          reason: null,
          superseded_by: null,
        },
        {
          id: "F-009",
          dimension: "D3",
          severity: "P2",
          anchor: "docs/tsd-payments.md:52",
          quote: "the retry budget is 3",
          what_is_wrong: "§2 says 3 retries, §6 says 5",
          consequence: "whoever reads only one section builds the wrong one",
          acceptance_line: "both sections say the same number, or one defers to the other",
          serves: "goal",
          carried: true,
          outcome: "resolved",
          reason: "§6 now points at §2",
          superseded_by: null,
        },
        {
          id: "F-014",
          dimension: "D5",
          severity: "P2",
          anchor: "docs/tsd-payments.md:140",
          quote: "settlement is deemed to have occurred",
          what_is_wrong: "passive voice in a normative sentence",
          consequence: "the reader cannot tell who does it",
          acceptance_line: "the actor is named",
          serves: "audience",
          carried: true,
          outcome: "still-open",
          reason: null,
          superseded_by: null,
        },
        {
          id: "F-016",
          dimension: "D2",
          severity: "P2",
          anchor: "docs/tsd-payments.md:96",
          quote: "the worker consumes from the queue",
          what_is_wrong: "superseded — §5 was rewritten and the claim moved",
          consequence: "—",
          acceptance_line: "see F-021",
          serves: "goal",
          carried: true,
          outcome: "superseded",
          reason: "§5 was rewritten around the outbox",
          superseded_by: "F-021",
        },
      ],
      dropped: [{ id: "F-020", why: "no `serves` — not traceable to a stated goal element" }],
    },
  ],
  open: [],
  dir: PROJECT + "/orc/orc-challenge/tsd-payments",
};

const challengeDiff = {
  ok: true,
  slug: "tsd-payments",
  state: "AWAITING-RECHECK",
  expected: "docs/tsd-payments-v4.md",
  found: true,
  sha_before: "3f9a71c2",
  sha_after: "b71c04ea",
  changed: true,
  added: 48,
  removed: 12,
  carried: [
    { id: "F-001", anchor: "docs/tsd-payments.md:118", severity: "P1", dimension: "D2", touched: true },
    { id: "F-007", anchor: "docs/tsd-payments.md:84", severity: "P1", dimension: "D5", touched: false },
    { id: "F-014", anchor: "docs/tsd-payments.md:140", severity: "P2", dimension: "D5", touched: false },
  ],
  touched: 1,
  untouched: ["F-007", "F-014"],
  note: "touched/untouched is a HINT for you, never an input to the judge — the judge always re-reads the artifact",
};

// The exit-2 branch. You cannot design a candidate list on a cycle whose
// revision is exactly where it was declared — and this is the one place the
// panel must offer a COMMAND rather than a pick.

const challengeDiffMissing = {
  ok: true,
  slug: "billing-webhooks",
  state: "MISSING-REVISION",
  expected: "docs/billing-webhooks-v2.md",
  found: false,
  since: "11-08-2026 18:22:07",
  candidates: [
    { path: "docs/billing-webhooks-v2.draft.md", added: 51, removed: 12 },
    { path: "src/billing/webhooks/handler.ts", added: 4, removed: 0 },
  ],
  note: "candidates are LISTED, never adopted — record the real one with `orc challenge expect <slug> --set <path>`",
};

const challengeLint = {
  ok: true,
  path: "docs/tsd-payments.md",
  template: PROJECT + "/orc/orc-challenge/tsd-payments/template.md",
  findings: [
    { id: "L-001", dimension: "D1", line: 1, what: 'required section missing: "error handling"', quote: null },
    { id: "L-002", dimension: "D5", line: 1, what: "40% of sentences look passive (heuristic; threshold 25%)", quote: null },
    { id: "L-003", dimension: "D1", line: 3, what: 'section "Overview" has 13 words of body — ceremony, not content', quote: "Overview" },
    { id: "L-004", dimension: "D6", line: 9, what: 'placeholder marker: "TBD"', quote: "## Scope\n\nTBD" },
    { id: "L-005", dimension: "D5", line: 84, what: "sentence is 43 words (over 25)", quote: "Once the settlement job has been kicked off, the reconciliation is not run until the window is closed…" },
    { id: "L-006", dimension: "D5", line: 84, what: 'idiom / phrasal verb: "kick off" — hard for a non-native reader', quote: null },
    { id: "L-007", dimension: "D5", line: 118, what: '"SoR" is used before it is defined', quote: null },
    { id: "L-008", dimension: "D6", line: 118, what: 'ambiguous quantifier: "appropriate" — an implementer cannot build from it', quote: null },
  ],
  counts: { total: 8, by_dimension: { D1: 2, D5: 4, D6: 2 } },
  metrics: { headings: 9, sentences: 61, words: 812, sentence_p50: 14, sentence_p90: 43, passive_pct: 40, flesch_kincaid_grade: 8.1 },
  structure: { required: 5, present: 4, missing: ["error handling"], out_of_order: false, invented: [] },
  honesty: [
    "This is a SIGNAL, not a verdict. A long sentence is not automatically a defect — the lint never blocks; it feeds the judge, who decides.",
    "It is English-specific and heuristic: the grade is an estimate and passive-voice detection is a pattern match.",
  ],
};

// ── /orc-doc (v0.48.0) ──────────────────────────────────────────────────────
// ONE FIXTURE PER STATE, and the ugly ones are the point: you cannot design the
// `user-edited` swatch on a document nobody has touched, the `open` dashed
// segment on a document with no gaps, a lint-RED health card on a clean file,
// or ribbon overflow on a document with nine sections.

module.exports = { chGoals, chDims, challengeCycles, challengeList, challengeShow, challengeDiff, challengeDiffMissing, challengeLint };
