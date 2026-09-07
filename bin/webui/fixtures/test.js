"use strict";
/* fixtures/test.js — canned data for `orc ui --fixtures`.
   /orc-test: the lane that RUNS the test.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a state you cannot reach, and on a healthy
   machine with one green run most of the states below are unreachable — so
   they get built once, blind, and never looked at again.

   What this file therefore carries, deliberately:
     · every list state the CLI computes, INCLUDING `UNREADABLE`
     · `env: unhealthy` — the state where ORC stops and hands back
     · a RED happy path that STOPPED the ladder, so the edge and security
       tiers are `unknown` rather than absent
     · `unchecked` API1 and API5, each with the reason it could not be measured
     · a REMOTE target with a build mismatch and an authorization statement
     · a target where NOBODY filled the authorization in
     · a code-vs-live diff that was NOT MEASURED, with its reason
     · a Playwright driver that is `absent`
     · a finding that was NOT observed, and a run whose REPORT.md is missing
     · a recorded flake

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted fixture
   is worse than no fixture. Every shape below was taken from a real run of
   `orc test show --json`, `orc test status --json`, `orc test env --json` and
   `orc test ui tools --json`. */

const { PROJECT } = require("./shell.js");

const DIR = "orc/orc-test";

/* ------------------------------------------------------------- the routes -- */

const routesToy = [
  { key: "GET /users", method: "GET", path: "/users", source: "code", file: "src/routes/users.js", line: 12, framework: "express", also: [], params: null, body: null, response: null, in_code: true, live: true },
  { key: "POST /users", method: "POST", path: "/users", source: "code", file: "src/routes/users.js", line: 31, framework: "express", also: [], params: null, body: null, response: null, in_code: true, live: true },
  { key: "GET /users/{}", method: "GET", path: "/users/{}", source: "spec", file: "openapi.yaml", line: null, framework: null, also: ["src/routes/users.js:44"], params: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], body: null, response: { status: 200, schema: { type: "object", properties: { id: { type: "string" }, email: { type: "string" } } } }, in_code: true, live: true },
  { key: "GET /orders", method: "GET", path: "/orders", source: "code", file: "src/routes/orders.js", line: 9, framework: "express", also: [], params: null, body: null, response: null, in_code: true, live: false },
  // THE SHADOW API. It answers at the target and exists nowhere in the
  // repository — OWASP API9. It keeps every field the live spec declared, so
  // the free case matrix derives from it exactly as it would from a route in
  // the code.
  { key: "GET /internal/debug", method: "GET", path: "/internal/debug", source: "spec-live", file: null, line: null, framework: null, also: [], params: null, body: null, response: null, in_code: false, live: true },
];

/* --------------------------------------------------------------- the cases -- */

const casesToy = [
  { id: "C-001", target: "GET /users", tier: "happy", kind: null, source: "derived", why: "the declared happy path", owasp: null, identity: "reader", mutates: false, gaps: [], verdict: "pass", verdict_why: "200, and the body carried no leak marker", last_status: 200, evidence: DIR + "/api-users/runs/03/evidence/C-001" },
  { id: "C-002", target: "GET /users/{}", tier: "happy", kind: null, source: "derived", why: "the declared happy path", owasp: null, identity: "reader", mutates: false, gaps: [], verdict: "pass", verdict_why: "200, and the body matched the declared response schema", last_status: 200, evidence: DIR + "/api-users/runs/03/evidence/C-002" },
  { id: "C-003", target: "GET /users/{}", tier: "edge", kind: null, source: "derived", why: "the path parameter at its declared boundary", owasp: null, identity: "reader", mutates: false, gaps: [], verdict: "fail", verdict_why: "expected one of 400, 404 — observed 500", last_status: 500, evidence: DIR + "/api-users/runs/03/evidence/C-003" },
  { id: "C-004", target: "GET /orders", tier: "edge", kind: null, source: "derived", why: "no page size was declared, so the default was pushed", owasp: null, identity: "reader", mutates: false, gaps: ["no schema was declared for this route — the designer fills what a schema cannot know"], verdict: "unknown", verdict_why: "not observed — the ladder stopped at the edge tier", last_status: null, evidence: null },
  { id: "C-005", target: "POST /users", tier: "abuse", kind: null, source: "designed", why: "the same email twice — the second write must be refused, not accepted", owasp: null, identity: "writer", mutates: true, gaps: [], verdict: "unknown", verdict_why: "not observed — the ladder stopped at the edge tier", last_status: null, evidence: null },
  { id: "C-006", target: "GET /users/{}", tier: "security", kind: null, source: "derived", why: "replay a successful request as a SECOND identity against an object it does not own", owasp: "API1", identity: "reader", mutates: false, gaps: [], verdict: "fail", verdict_why: "200 — the second identity read an object it does not own", last_status: 200, evidence: DIR + "/api-users/runs/03/evidence/C-006" },
  { id: "C-007", target: "GET /internal/debug", tier: "security", kind: null, source: "derived", why: "a route that answers at the target and exists nowhere in the repository", owasp: "API9", identity: null, mutates: false, gaps: [], verdict: "fail", verdict_why: "200 — this route is live and is in no file in this repository", last_status: 200, evidence: DIR + "/api-users/runs/03/evidence/C-007" },
  { id: "C-008", target: "GET /users", tier: "security", kind: null, source: "derived", why: "misconfiguration — the response security headers", owasp: "API8", identity: null, mutates: false, gaps: [], verdict: "pass", verdict_why: "every header the closed set names was present", last_status: 200, evidence: DIR + "/api-users/runs/03/evidence/C-008" },
];

/* ------------------------------------------------------ the OWASP row set -- */
// The CLOSED set — ten rows, every one of them present in every state,
// because a category nobody could measure and a category that came back clean
// must never look the same. `unchecked` keeps its slot, never becomes a pass
// and never raises the exit code.

const sev = (severity, why, cvss) => ({ severity, derived: !!cvss, why, cvss: cvss || null, cvss_note: cvss ? null : "No CVSS vector: this finding was not OBSERVED, and a candidate pending verification does not get a score." });

const secRowsToy = [
  {
    owasp: "API1",
    name: "Broken object level authorization (BOLA)",
    needs: "two identities",
    probe: "replay a successful request as a SECOND identity against an object it does not own",
    cases: [{ id: "C-006", target: "GET /users/{}", why: "replay a successful request as a SECOND identity against an object it does not own", verdict: "fail", verdict_why: "200 — the second identity read an object it does not own", evidence: DIR + "/api-users/runs/03/evidence/C-006", identity: "reader", mutates: false }],
    found: 1,
    unknown: 0,
    pass: 0,
    unchecked: null,
    state: "FOUND",
    severity: sev("critical", "OBSERVED, and the request crossed an identity boundary: a second caller read an object it does not own.", "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N"),
  },
  {
    owasp: "API2",
    name: "Broken authentication",
    needs: "a traced flow that shows the route is authenticated",
    probe: "repeat an authenticated request with the credential removed",
    cases: [{ id: "C-009", target: "GET /users", why: "repeat an authenticated request with the credential removed", verdict: "pass", verdict_why: "401 — the credential is required", evidence: DIR + "/api-users/runs/03/evidence/C-009", identity: null, mutates: false }],
    found: 0,
    unknown: 0,
    pass: 1,
    unchecked: null,
    state: "observed-clean",
    severity: sev("high", "OWASP API2 carries a base severity of high. NOT OBSERVED — that base is the CATEGORY's severity, not this finding's."),
  },
  {
    owasp: "API3",
    name: "Broken object property level authorization (BOPLA)",
    needs: "a declared success response schema",
    probe: "compare the returned properties against the declared schema, and offer a privileged property on a write",
    cases: [{ id: "C-011", target: "POST /users", why: "offer a privileged property the schema does not declare", verdict: "unknown", verdict_why: "not observed — the ladder stopped at the edge tier", evidence: null, identity: "writer", mutates: true }],
    found: 0,
    unknown: 1,
    pass: 0,
    unchecked: null,
    state: "not-observed",
    severity: sev("high", "OWASP API3 carries a base severity of high. NOT OBSERVED — that base is the CATEGORY's severity, not this finding's."),
  },
  {
    owasp: "API4",
    name: "Unrestricted resource consumption",
    needs: "a declared request body or a page-size parameter",
    probe: "push the declared size against ORC's own caps and record what the target does",
    cases: [
      { id: "C-012", target: "GET /orders", why: "push the page size against ORC's own cap of 1,000,000", verdict: "pass", verdict_why: "400 — the page size was refused", evidence: DIR + "/api-users/runs/03/evidence/C-012", identity: "reader", mutates: false },
      { id: "C-013", target: "POST /users", why: "push the body against ORC's own 256KB cap", verdict: "unknown", verdict_why: "not observed — the ladder stopped at the edge tier", evidence: null, identity: "writer", mutates: true },
    ],
    found: 0,
    unknown: 1,
    pass: 1,
    unchecked: null,
    state: "partly-observed",
    severity: sev("medium", "OWASP API4 carries a base severity of medium. NOT OBSERVED — that base is the CATEGORY's severity, not this finding's."),
  },
  {
    owasp: "API5",
    name: "Broken function level authorization (BFLA)",
    needs: "two distinguishable roles",
    probe: "call a privileged function as the role that should be refused",
    cases: [],
    found: 0,
    unknown: 0,
    pass: 0,
    unchecked: [{ scope: "API5", why: "only one ROLE is declared. BFLA asks whether a caller who should be REFUSED is refused; with one role there is nobody to refuse. Declare a second role with `orc test identity add`.", measured: false }],
    state: "unchecked",
    severity: sev("high", "OWASP API5 carries a base severity of high. NOT OBSERVED — that base is the CATEGORY's severity, not this finding's."),
  },
  {
    owasp: "API6",
    name: "Unrestricted access to sensitive business flows",
    needs: "`full` tier and --destructive allow",
    probe: "repeat a state-changing request and stop the moment something refuses",
    cases: [],
    found: 0,
    unknown: 0,
    pass: 0,
    unchecked: [{ scope: "API6", why: "a business-flow probe REPEATS a state-changing request, so it is `full` only. It needs `test_security_tier: full` AND `--destructive allow` with a recorded reason.", measured: false }],
    state: "unchecked",
    severity: sev("medium", "OWASP API6 carries a base severity of medium. NOT OBSERVED — that base is the CATEGORY's severity, not this finding's."),
  },
  {
    owasp: "API7",
    name: "Server side request forgery (SSRF)",
    needs: "a URL-shaped input",
    probe: "supply an address ORC's own loopback listener owns, and record whether the target fetched it",
    cases: [],
    found: 0,
    unknown: 0,
    pass: 0,
    unchecked: [{ scope: "API7", why: "no selected target declares a URL-shaped input (a `url`/`uri`/`callback`/`webhook`-named parameter, or one with `format: uri`). Nothing here takes an address for the server to fetch.", measured: false }],
    state: "unchecked",
    severity: sev("high", "OWASP API7 carries a base severity of high. NOT OBSERVED — that base is the CATEGORY's severity, not this finding's."),
  },
  {
    owasp: "API8",
    name: "Security misconfiguration",
    needs: "nothing — it reads the response the happy path already produced",
    probe: "the response security headers, the error body, and the methods the route answers",
    cases: [{ id: "C-008", target: "GET /users", why: "misconfiguration — the response security headers", verdict: "pass", verdict_why: "every header the closed set names was present", evidence: DIR + "/api-users/runs/03/evidence/C-008", identity: null, mutates: false }],
    found: 0,
    unknown: 0,
    pass: 1,
    unchecked: null,
    state: "observed-clean",
    severity: sev("medium", "OWASP API8 carries a base severity of medium. NOT OBSERVED — that base is the CATEGORY's severity, not this finding's."),
  },
  {
    owasp: "API9",
    name: "Improper inventory management",
    needs: "a spec at the target to compare the code against",
    probe: "the code-vs-live diff — a route that answers and is in no file here",
    cases: [{ id: "C-007", target: "GET /internal/debug", why: "a route that answers at the target and exists nowhere in the repository", verdict: "fail", verdict_why: "200 — this route is live and is in no file in this repository", evidence: DIR + "/api-users/runs/03/evidence/C-007", identity: null, mutates: false }],
    found: 1,
    unknown: 0,
    pass: 0,
    unchecked: null,
    state: "FOUND",
    severity: sev("medium", "OBSERVED. A live route that is in no file here is undocumented surface: nobody reviews it and nobody patches it.", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N"),
  },
  {
    owasp: "API10",
    name: "Unsafe consumption of APIs",
    needs: "a traced flow that names an outbound call",
    probe: "STATIC ONLY — nothing is probed",
    cases: [],
    found: 0,
    unknown: 0,
    pass: 0,
    unchecked: [{ scope: "API10", why: "this row is STATIC ONLY — nothing is probed, because what this application calls out to belongs to somebody else and this run's authorization covers the target alone.", measured: true }],
    state: "unchecked",
    severity: sev("medium", "OWASP API10 carries a base severity of medium. NOT OBSERVED — that base is the CATEGORY's severity, not this finding's."),
  },
];

/* ------------------------------------------------------------ the findings -- */

const findingsToy = [
  {
    id: "F-001",
    title: "A second identity can read another account's user record",
    what: "C-006 replayed the reader's successful GET /users/{id} as the second identity against an object it does not own, and the target answered 200 with that object's body.",
    evidence: DIR + "/api-users/runs/03/evidence/C-006",
    case: "C-006",
    target: "GET /users/{}",
    owasp: "API1",
    observed: true,
    claimed_severity: "high",
    severity: "critical",
    severity_why: "OBSERVED, and the request crossed an identity boundary: a second caller read an object it does not own.",
    cvss: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N",
    cvss_note: null,
    confidence: "observed",
    impact: "Any signed-in caller can read any other account's record by changing one path segment.",
    fix: "Check the object's owner against the caller in the handler, not in the route table.",
    at: "2026-09-04T11:22:41.000Z",
  },
  {
    id: "F-002",
    title: "GET /internal/debug answers at the target and is in no file here",
    what: "The code-vs-live diff names it live-only. C-007 confirmed it answers 200.",
    evidence: DIR + "/api-users/runs/03/evidence/C-007",
    case: "C-007",
    target: "GET /internal/debug",
    owasp: "API9",
    observed: true,
    claimed_severity: null,
    severity: "medium",
    severity_why: "OBSERVED. A live route that is in no file here is undocumented surface: nobody reviews it and nobody patches it.",
    cvss: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
    cvss_note: null,
    confidence: "observed",
    impact: "Undocumented surface on a host this repository does not describe.",
    fix: "Either delete the route or bring it into the repository and the spec.",
    at: "2026-09-04T11:22:44.000Z",
  },
  {
    // NOT OBSERVED. The interpreter proposed it; the case behind it never ran,
    // because the ladder stopped. It carries no CVSS vector and it is not a
    // pass — the two things a report must never blur.
    id: "F-003",
    title: "The duplicate-write path may accept the same email twice",
    what: "C-005 was derived and never reached: the ladder stopped at the edge tier when C-003 came back 500.",
    evidence: DIR + "/api-users/runs/03/evidence/C-003",
    case: "C-005",
    target: "POST /users",
    owasp: null,
    observed: false,
    claimed_severity: "medium",
    severity: "medium",
    severity_why: "NOT OBSERVED. This is a candidate pending verification, not a finding.",
    cvss: null,
    cvss_note: "No CVSS vector: this finding was not OBSERVED, and a candidate pending verification does not get a score.",
    confidence: "suspected",
    impact: null,
    fix: null,
    at: "2026-09-04T11:22:46.000Z",
  },
];

/* --------------------------------------------------------------- the runs -- */

const testShowToy = {
  ok: true,
  slug: "api-users",
  state: "RED",
  target: { kind: "be", env: "local", base_url: "http://127.0.0.1:4000", origin: "http://127.0.0.1:4000", authorized: "me, on my own laptop, against my own dev database", destructive: { mode: "deny", reason: "this box shares a database with the seed script" } },
  authorized: "me, on my own laptop, against my own dev database",
  destructive: { mode: "deny", reason: "this box shares a database with the seed script" },
  identities: [
    { name: "reader", role: "user", source: "env", verified_at: "2026-09-04T10:58:02.000Z" },
    { name: "writer", role: "user", source: "vault", verified_at: "2026-09-04T10:58:40.000Z" },
  ],
  two_identities: true,
  selected: ["GET /users", "GET /users/{}", "POST /users", "GET /orders", "GET /internal/debug"],
  flows: ["GET /users/{}"],
  counts: { pass: 4, fail: 3, unknown: 4, unrun: 2 },
  cases: casesToy,
  case_budget: { budget: 200, reached: false, unfinished: [] },
  surface: {
    at: "2026-09-04T10:41:09.000Z",
    spec_on_disk: { kind: "openapi", file: "openapi.yaml", parsed: true, why: null, routes: 4 },
    spec_at_target: { probed: true, reachable: true, tried: ["/openapi.json", "/swagger.json"], found: "http://127.0.0.1:4000/openapi.json" },
    frameworks: ["express"],
    files_scanned: 34,
    routes: routesToy,
    mounts: [{ prefix: "/api/v1", file: "src/server.js", line: 22 }],
    unresolved: [{ file: "src/routes/index.js", line: 18, text: "router.use(mountFromConfig(cfg))" }],
    diff: {
      source: "spec-vs-spec",
      code_only: [{ key: "GET /orders", file: "src/routes/orders.js", line: 9 }],
      live_only: [{ key: "GET /internal/debug" }],
      note: "derived from the two specs — no route was probed to produce it",
    },
  },
  env: { state: null, stored: false, note: "not stored — a health state is computed fresh on every read. `orc test env <slug>` takes a reading." },
  security: {
    tier: "safe",
    tier_source: { value: "safe", source: "the shipped default" },
    notes: ["`full` was requested and is CLIPPED to `safe`: it adds the MUTATING probes, and this run was frozen `--destructive deny`."],
    rows: secRowsToy,
    statics: [{ owasp: "API10", what: "outbound calls named by a traced flow — STATIC ONLY, nothing was probed", rows: [{ at: "src/clients/billing.js:41", what: "POST https://billing.example.com/charges", target: "GET /users/{}" }] }],
    found: 2,
  },
  runs: [
    { n: 1, at: "2026-09-04T11:02:10.000Z", counts: { pass: 2, fail: 0, unknown: 6, unrun: 0 }, stopped: null, dir: "runs/01" },
    { n: 2, at: "2026-09-04T11:14:55.000Z", counts: { pass: 5, fail: 1, unknown: 2, unrun: 0 }, stopped: null, dir: "runs/02" },
    // THE LADDER STOPPED. A red happy path makes the edge cases meaningless and
    // the security tier noise, so the run stops, reports, and hands back.
    { n: 3, at: "2026-09-04T11:22:03.000Z", counts: { pass: 4, fail: 3, unknown: 4, unrun: 0 }, stopped: "edge", dir: "runs/03" },
  ],
  findings: findingsToy,
  // A FLAKE IS RECORDED, NEVER RETRIED AWAY. The instability IS the finding.
  flakes: [{ run: 3, id: "C-004", was: "pass", now: "unknown" }],
  events: [
    { at: "2026-09-04T10:38:00.000Z", what: "init", detail: "target frozen: be/local http://127.0.0.1:4000" },
    { at: "2026-09-04T10:41:09.000Z", what: "surface", detail: "5 routes, 1 unresolved" },
    { at: "2026-09-04T11:22:03.000Z", what: "run", detail: "run 3: 4 pass, 3 fail, 4 unknown" },
    { at: "2026-09-04T11:22:46.000Z", what: "record", detail: "3 recorded, 1 dropped" },
  ],
  paths: { run: DIR + "/api-users", report: DIR + "/api-users/REPORT.md", findings: DIR + "/api-users/findings.md", surface: DIR + "/api-users/surface.md", changes: DIR + "/api-users/changes.md" },
  report_exists: true,
  where: "Where it stands:  /orc-test · be/local · 12 cases · 3 runs · 3 red",
  never_staged: "This folder holds real response bodies from a real system. It is never staged, and ORC does not edit your .gitignore.",
};

/* A REMOTE target. Everything about it is different: ORC will not bring an
   environment up on a host it does not own, the authorization statement is
   REQUIRED, and a failing selector here is a BUILD MISMATCH before it is a
   defect. This one also carries a diff that was NOT MEASURED, which must never
   render as "no shadow APIs". */
const testShowRemote = {
  ok: true,
  slug: "staging-checkout",
  state: "PARTIAL",
  target: { kind: "both", env: "remote", base_url: "https://staging.example.com", origin: "https://staging.example.com", authorized: "the platform team, in ticket OPS-4471, for the window 04-09 09:00-12:00", destructive: { mode: "allow", reason: "OPS-4471 names the seeded tenant and says it is disposable" } },
  authorized: "the platform team, in ticket OPS-4471, for the window 04-09 09:00-12:00",
  destructive: { mode: "allow", reason: "OPS-4471 names the seeded tenant and says it is disposable" },
  identities: [{ name: "shopper", role: "user", source: "login", verified_at: "2026-09-04T09:12:00.000Z" }],
  two_identities: false,
  selected: ["POST /checkout"],
  flows: [],
  counts: { pass: 1, fail: 0, unknown: 2, unrun: 0 },
  cases: [
    { id: "C-001", target: "POST /checkout", tier: "happy", kind: null, source: "derived", why: "the declared happy path", owasp: null, identity: "shopper", mutates: true, gaps: [], verdict: "pass", verdict_why: "201", last_status: 201, evidence: DIR + "/staging-checkout/runs/01/evidence/C-001" },
    { id: "C-002", target: "POST /checkout", tier: "edge", kind: null, source: "designed", why: "an empty basket must be refused", owasp: null, identity: "shopper", mutates: true, gaps: [], verdict: "unknown", verdict_why: "429 — the target rate-limited this run, and ORC backed off rather than pushing through", last_status: 429, evidence: DIR + "/staging-checkout/runs/01/evidence/C-002" },
    // A UI case. It is an ordinary case row and the BE runner never touches it.
    { id: "C-003", target: "checkout-happy", tier: "happy", kind: "ui", source: "designed", why: "the checkout journey, end to end", owasp: null, identity: "shopper", mutates: true, gaps: [], verdict: "unknown", verdict_why: "the selector `[data-testid=\"pay\"]` was not found. On a REMOTE target that is a BUILD MISMATCH before it is a defect: the deployed bundle may predate the attribute.", last_status: null, evidence: DIR + "/staging-checkout/ui/runs/01/checkout-happy" },
  ],
  case_budget: { budget: 200, reached: false, unfinished: [] },
  surface: {
    at: "2026-09-04T09:20:00.000Z",
    spec_on_disk: { kind: "openapi", file: "openapi.yaml", parsed: false, why: "the file is present and did not parse as YAML at line 212", routes: 0 },
    spec_at_target: { probed: true, reachable: true, tried: ["/openapi.json", "/swagger.json", "/v3/api-docs"], found: null },
    frameworks: ["nestjs"],
    files_scanned: 61,
    routes: [{ key: "POST /checkout", method: "POST", path: "/checkout", source: "code", file: "src/checkout/checkout.controller.ts", line: 28, framework: "nestjs", also: [], params: null, body: null, response: null, in_code: true, live: null }],
    mounts: [],
    unresolved: [],
    diff: {
      source: null,
      code_only: null,
      live_only: null,
      why: "no spec answered at the target, so there is nothing to compare the code against. This is NOT 'no shadow APIs' — it is 'not measured'.",
    },
  },
  env: { state: null, stored: false, note: "not stored — a health state is computed fresh on every read. `orc test env <slug>` takes a reading." },
  security: { tier: "off", tier_source: { value: "off", source: "test_security_tier in .claude/orc.config.yaml" }, notes: [], rows: secRowsToy.map((r) => ({ ...r, cases: [], found: 0, unknown: 0, pass: 0, state: "unchecked", unchecked: [{ scope: r.owasp, why: "the security tier is `off` for this run. Nothing was probed, and nothing here is a pass.", measured: false }] })), statics: [], found: 0 },
  runs: [{ n: 1, at: "2026-09-04T09:41:00.000Z", counts: { pass: 1, fail: 0, unknown: 2, unrun: 0 }, stopped: null, dir: "runs/01" }],
  findings: [],
  flakes: [],
  events: [{ at: "2026-09-04T09:05:00.000Z", what: "init", detail: "target frozen: both/remote https://staging.example.com" }],
  paths: { run: DIR + "/staging-checkout", report: DIR + "/staging-checkout/REPORT.md", findings: DIR + "/staging-checkout/findings.md", surface: DIR + "/staging-checkout/surface.md", changes: DIR + "/staging-checkout/changes.md" },
  // NO REPORT ON DISK YET. The panel must offer to render one rather than link
  // at a file that is not there.
  report_exists: false,
  where: "Where it stands:  /orc-test · both/remote · 3 cases · 1 run",
  never_staged: "This folder holds real response bodies from a real system. It is never staged, and ORC does not edit your .gitignore.",
};

/* A run that got as far as a frozen target and no further, and whose
   AUTHORIZATION STATEMENT NOBODY FILLED IN. That is a state, not a blank: the
   panel says so on the target card rather than rendering an empty row. */
const testShowEarly = {
  ok: true,
  slug: "orders-api",
  state: "AWAITING-IDENTITY",
  target: { kind: "be", env: "local", base_url: "http://127.0.0.1:3999", origin: "http://127.0.0.1:3999", authorized: null, destructive: { mode: "deny", reason: "read only" } },
  authorized: null,
  destructive: { mode: "deny", reason: "read only" },
  identities: [],
  two_identities: false,
  selected: [],
  flows: [],
  counts: { pass: 0, fail: 0, unknown: 0, unrun: 0 },
  cases: [],
  case_budget: null,
  surface: null,
  env: { state: null, stored: false, note: "not stored — a health state is computed fresh on every read. `orc test env <slug>` takes a reading." },
  security: { tier: "safe", tier_source: { value: "safe", source: "the shipped default" }, notes: [], rows: secRowsToy.map((r) => ({ ...r, cases: [], found: 0, unknown: 0, pass: 0, state: "not-run", unchecked: null })), statics: [], found: 0 },
  runs: [],
  findings: [],
  flakes: [],
  events: [{ at: "2026-09-05T08:00:00.000Z", what: "init", detail: "target frozen: be/local http://127.0.0.1:3999" }],
  paths: { run: DIR + "/orders-api", report: DIR + "/orders-api/REPORT.md", findings: DIR + "/orders-api/findings.md", surface: DIR + "/orders-api/surface.md", changes: DIR + "/orders-api/changes.md" },
  report_exists: false,
  where: "Where it stands:  /orc-test · be/local · 0 cases · 0 runs",
  never_staged: "This folder holds real response bodies from a real system. It is never staged, and ORC does not edit your .gitignore.",
};

/* An UNREADABLE ledger. It is a ROW, never a crash and never a silent gap —
   a listing that drops it is a listing that hides the one run that needs
   attention. */
const testShowUnreadable = { ok: true, slug: "half-written", state: "UNREADABLE", error: "orc/orc-test/half-written/test.json: Unexpected end of JSON input" };

const testShows = {
  "api-users": testShowToy,
  "staging-checkout": testShowRemote,
  "orders-api": testShowEarly,
  "half-written": testShowUnreadable,
};

/* --------------------------------------------------------------- the list -- */

const rowOf = (s, cases, runs, findings, updated) => ({
  slug: s.slug,
  state: s.state,
  target: s.target,
  identities: s.identities,
  counts: s.counts,
  cases,
  runs,
  last_run: (s.runs && s.runs.length && s.runs[s.runs.length - 1].at) || null,
  findings,
  updated_at: updated,
  where: s.where,
});

const testList = {
  ok: true,
  dir: DIR,
  count: 4,
  open: 3,
  runs: [
    rowOf(testShowToy, 12, 3, 3, "2026-09-04T11:22:46.000Z"),
    rowOf(testShowRemote, 3, 1, 0, "2026-09-04T09:41:00.000Z"),
    rowOf(testShowEarly, 0, 0, 0, "2026-09-05T08:00:00.000Z"),
    { slug: "half-written", state: "UNREADABLE", error: "orc/orc-test/half-written/test.json: Unexpected end of JSON input", target: null },
  ],
};

/* -------------------------------------------------- the front-end driver -- */
// `absent`, because that is the state a first-time reader is in and the one
// the panel has the most to say about. `no_install_alternative: null` MEANS
// there is none — never that ORC forgot to look — and ORC NAMES the install
// command and never runs it.

const testUiTools = {
  ok: true,
  ui: {
    driver: "playwright",
    tool: "playwright",
    states: ["absent", "outdated", "unauthenticated", "ready"],
    state: "absent",
    installed: false,
    bin: null,
    from: null,
    version: null,
    min_version: "1.40.0",
    outdated: false,
    browsers_dir: PROJECT + "/.cache/ms-playwright",
    browsers: [],
    no_install_alternative: null,
    install: {
      docs_url: "https://playwright.dev/docs/intro",
      cmds: [
        { manager: "npm", cmd: "npm i -D @playwright/test" },
        { manager: "browsers", cmd: "npx playwright install chromium" },
      ],
    },
    next: "npm i -D @playwright/test && npx playwright install chromium",
    why: "no `playwright` is resolvable — not in this project's node_modules and not on PATH.",
  },
};

/* ------------------------------------------------------- the environment -- */
// The env probe is the /orc-test equivalent of `orc extra ping`: a button, and
// the outcome is the state worth designing. Keyed by slug so `unhealthy` — the
// state where ORC STOPS AND HANDS BACK — is reachable in the panel, alongside
// `absent` and the remote refusal.

const testEnvUnhealthy = {
  ok: true,
  slug: "api-users",
  state: "unhealthy",
  next: { action: "STOP — hand back", cmd: null, why: "the process is up and answering wrong. ORC does not fix the system it is testing." },
  detected: { rung: "package.json", file: "package.json", command: "npm run dev", healthcheck: false },
  looked_for: ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", "package.json", "Procfile", "Makefile", "makefile"],
  health: {
    rung: "/health",
    ok: false,
    tried: [
      { path: "/health", status: 500, reason: null },
      { path: "/healthz", status: 404, reason: null },
      { path: "/", status: 500, reason: null },
    ],
    why: "the base URL answered 500 on every health path",
    measures: "the process is answering, and answering wrong",
  },
  process: { pid: 48211, at: "2026-09-04T10:55:12.000Z", cmd: "npm run dev", alive: true },
  env_vars: { file: ".env.example", missing: ["STRIPE_SECRET_KEY", "SESSION_SECRET"], note: "ORC NAMES the absent keys and invents no value for one — a placeholder written into a real environment is a credential-shaped lie." },
  log_tail: [
    "  at Object.connect (src/db/pool.js:41:11)",
    "Error: password authentication failed for user \"app\"",
    "[dev] listening on http://127.0.0.1:4000",
  ],
};

const testEnvAbsent = {
  ok: true,
  slug: "orders-api",
  state: "absent",
  next: { action: "tell ORC the command", cmd: null, why: "no start command could be detected — see `looked_for`" },
  detected: { rung: null, file: null, command: null, healthcheck: false },
  looked_for: ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", "package.json", "Procfile", "Makefile", "makefile"],
  health: { rung: null, ok: false, tried: [{ path: "/health", status: null, reason: "unreachable" }, { path: "/", status: null, reason: "unreachable" }], why: "connect ECONNREFUSED 127.0.0.1:3999", measures: "nothing answered on the base URL" },
  process: null,
  env_vars: null,
  log_tail: [],
};

// A REMOTE target has no environment here for ORC to bring up, and it will not
// try. Exit 2, refused by name.
const testEnvRemote = {
  ok: false,
  reason: "remote-target",
  hint: "staging-checkout is a REMOTE target. There is no environment here for ORC to bring up, and it will not try: starting or stopping something on a host you do not own is not this lane's business. Check the target yourself, then `orc test run`.",
};

module.exports = { testList, testShows, testShowToy, testUiTools, testEnvUnhealthy, testEnvAbsent, testEnvRemote };
