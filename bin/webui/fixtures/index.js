"use strict";
/**
 * fixtures.js — canned API responses for `orc ui --fixtures`.
 *
 * This exists because you cannot DESIGN a state you cannot reach. On a healthy
 * install with a fresh wiki and no paused runs, the STALE chip, the `waiting`
 * run card, the shadowed-setting lock and the unhealthy doctor panel are
 * unreachable — so they get built once, blind, and never looked at again.
 *
 * The rule for this file: carry ONE OF EVERY STATE, including the ugly ones.
 * It also means the UI can be worked on with no ORC project at all.
 *
 * Shapes MUST match what `bin/cli.js --json` really emits. A fixture that has
 * drifted from the CLI is worse than no fixture, so test/webui.test.js asserts
 * the fixture key set against the live CLI output for the shared routes.
 */


// v0.48.1 — the data lives one file per panel; this file is the ROUTER and
// nothing else. Adding a fixture is a new key in the panel's own file plus a
// case here; it is never an edit to a 1 700-line module.
const { PROJECT, doctor, where } = require("./shell.js");
const { config } = require("./settings.js");
const { wiki, wikiDocs, wikiShow, wikiCoverage, wikiCoverageFull, wikiUnregistered, wikiPlan, wikiDebt, wikiUsage, patterns, patternShow, gotchas, gotchasArchived, gotchaPrunePreview, wikiImpact } = require("./knowledge.js");
const { runs, runDetail, runDetailClosed, aftermath } = require("./runs.js");
const { stats, budgetForecast, budgetRates } = require("./stats.js");
const { pact } = require("./pact.js");
const { boundary } = require("./boundary.js");
const { handoff } = require("./handoff.js");
const { exportState, mocks } = require("./maintenance.js");
const { chGoals, chDims, challengeRoles, challengeCouncil, challengeCycles, challengeList, challengeShow, challengeDiff, challengeDiffMissing, challengeLint } = require("./challenge.js");
const { docList, docParts, docStatuses, docMapSections, docMap, docLint, docPlan, docShow, docSection, docShipped, docShippedDrifted, docNext, docAudit, docJournalRich, docJournalEmpty, docContext, docRules, docRulesFrozen, docForecast, docCost } = require("./docs.js");
const { diy } = require("./flow.js");
const { crosslink } = require("./crosslink.js");
const { mockDetail } = require("./mockrun.js");
const { extraProviders, extraList, extraListNoConnection, extraListNeverTested, extraTools, extraKeyhelp, extraModels, extraDoctor, extraRoute, extraLanes, extraStats, extraRates, extraPingOk, extraPingBad, extraPingSaveOffer, extraJournal, extraReconcile, extraJournalPrune, extraPingLive, extraPingDeadModel, extraPingNotInstalled, extraInstall } = require("./extra.js");

module.exports.get = function get(route, q) {
  switch (route) {
    case "/api/doc":
      return docList;
    case "/api/doc/one":
      // The two SHIPPED states overlay the plain ones, so `shipped`,
      // `shipped-drifted` and a FORCED ship are all reachable in the panel.
      return (
        { [docShipped.slug]: docShipped, [docShippedDrifted.slug]: docShippedDrifted }[q && q.slug] ||
        (q && docStatuses[q.slug]) ||
        docStatuses["prd-checkout-refund-130826"]
      );
    case "/api/doc/show":
      // The memory fields ride on whichever slug was asked for, so the header
      // strip, the brief and the journal are all designable per state.
      return {
        ...docShow,
        slug: (q && q.slug) || docShow.slug,
        created_at: "13-08-2026 09:02:11",
        last_touched_at: "15-08-2026 17:05:00",
        sessions: 3,
        context: (docContext[q && q.slug] || docContext["prd-checkout-refund-130826"]).context,
        journal: (q && q.slug === "collab-risk-and-payments-130826" ? docJournalEmpty : docJournalRich).journal,
        shipped: (docStatuses[q && q.slug] || {}).shipped || null,
        ship_history: [],
      };
    case "/api/doc/map":
      return docMap;
    case "/api/doc/lint":
      return docLint;
    case "/api/doc/plan":
      return docPlan;
    case "/api/doc/section":
      return docSection;
    // v0.48.1. Each of these has ONE OF EVERY STATE behind it: a free next, a
    // paid next, a next that is blocked on a human; a clean audit and a dirty
    // one; a rich journal and one with nothing recorded at all.
    case "/api/doc/parts":
      return docParts[(q && q.slug) || ""] || docParts["prd-checkout-refund-130826"];
    case "/api/doc/next":
      return docNext[(q && q.slug) || ""] || docNext["prd-checkout-refund-130826"];
    case "/api/doc/audit":
      return docAudit[(q && q.slug) || ""] || docAudit["prd-checkout-refund-130826"];
    case "/api/doc/journal":
      return (q && q.slug) === "collab-risk-and-payments-130826" ? docJournalEmpty : docJournalRich;
    // v0.52.0 (D9) — BOTH shapes: a document routed off Claude, and one that is
    // not. `off` is a state with its own card, never a missing card.
    case "/api/doc/extra":
      return q && String(q.slug || "").indexOf("prd-") === 0
        ? {
            ok: true,
            slug: String(q.slug),
            extra: "writer",
            stored: "writer",
            source: "doc.json",
            options: ["off", "writer", "checker", "both"],
            resolve_order: ["doc.json (this document)", "config.extra_roles (the project)", "off"],
            config_roles: ["executor", "doc-writer"],
            shadowed_by_config: [],
            why: "writer goes off Claude for this document; every other role stays on Claude.",
            edges: { band: "[40,80)", edges: [40, 79], agree: true, resolved: { profile: "cheap", model: "deepseek-chat" } },
            default: "off",
          }
        : {
            ok: true,
            slug: String(q && q.slug),
            extra: "off",
            stored: null,
            source: "off",
            options: ["off", "writer", "checker", "both"],
            resolve_order: ["doc.json (this document)", "config.extra_roles (the project)", "off"],
            config_roles: [],
            shadowed_by_config: [],
            why: "nothing in this document goes off Claude.",
            edges: null,
            default: "off",
          };
    case "/api/doc/context":
      return docContext[(q && q.slug) || ""] || docContext["prd-checkout-refund-130826"];
    // v0.49.2. One of every state behind each: a populated ledger AND an empty
    // one, frozen-clean AND frozen-drifted, a real forecast AND a refusal AND a
    // naive floor, a cost report joined AND one with no trace at all.
    case "/api/doc/rules":
      return docRules;
    case "/api/doc/rules/one":
      return docRulesFrozen[(q && q.slug) || ""] || docRulesFrozen["prd-checkout-refund-130826"];
    case "/api/doc/forecast":
      return docForecast[(q && q.slug) || ""] || docForecast["prd-checkout-refund-130826"];
    case "/api/doc/cost":
      return docCost[(q && q.slug) || ""] || docCost["prd-checkout-refund-130826"];
    case "/api/challenge":
      return challengeList;
    case "/api/challenge/one":
      return (q && challengeCycles[q.slug]) || challengeCycles["tsd-payments"];
    case "/api/challenge/show":
      // Only the rich cycle carries findings. Every other slug returns its own
      // identity with an empty iteration list, which is the honest shape for a
      // cycle nobody has judged yet — and stops the panel drawing one cycle's
      // findings under another cycle's name.
      return q && q.slug && q.slug !== challengeShow.slug
        ? { ...challengeShow, slug: q.slug, iterations: [], accepted: {}, rebuttals: {}, events: [] }
        : challengeShow;
    case "/api/challenge/diff":
      return q && q.slug === "billing-webhooks" ? challengeDiffMissing : challengeDiff;
    case "/api/challenge/lint":
      return challengeLint;
    case "/api/challenge/roles":
      return challengeRoles;
    case "/api/challenge/council":
      // UNSET is an ANSWER, not an error — the panel has to be designable
      // against a cycle nobody has answered the roster for.
      return q && q.slug === "billing-webhooks"
        ? { ok: false, slug: "billing-webhooks", council: null, council_version: 1, suggested: challengeRoles.council.slice(0, 3), rows: challengeCycles["billing-webhooks"].council, lens_counts: {}, reason: "council-unset", hint: 'the roster is a decision, not a default; run `orc challenge council billing-webhooks --set <csv|all|none> --reason "…"`' }
        : challengeCouncil;
    case "/api/meta":
      return undefined; // served for real even in fixture mode
    case "/api/version":
      // An update IS available here on purpose. "Up to date" is the state that
      // needs no design; you cannot lay out the update chip, the rail dot or
      // the upgrade row against a version that matches.
      return { version: "0.43.2", latest: "0.44.0", update_available: true, install_spec: "github:azure-id/orc", checked_source: "https://raw.githubusercontent.com/azure-id/orc/main/package.json", checked_ref: "azure-id/orc@main", check_disabled: false };
    case "/api/where":
      return where;
    case "/api/doctor":
      return doctor;
    case "/api/config":
      return config;
    case "/api/config/profiles":
      return {
        profiles: [
          { name: "solo-fast", desc: "One person, moving fast, reads their own diffs. Fewer gates, bigger waves.", keys: { max_wave_tasks: 4, batch_pause_every: 3 }, changes: [{ key: "batch_pause_every", from: 2, to: 3 }] },
          { name: "balanced", desc: "Today's defaults. Change nothing unless you know why.", keys: { max_wave_tasks: 3 }, changes: [{ key: "max_wave_tasks", from: 4, to: 3 }] },
          { name: "paranoid", desc: "Shared codebase, real users. Every gate on, small waves, pause often.", keys: { max_wave_tasks: 2, security_review: "on" }, changes: [{ key: "max_wave_tasks", from: 4, to: 2 }, { key: "security_review", from: "off", to: "on" }] },
          { name: "token-lean", desc: "Big repo, tight budget. Narrow scans, shallow analysis.", keys: { max_scouts: 1 }, changes: [{ key: "max_scouts", from: 3, to: 1 }] },
        ],
      };
    case "/api/config/recommend":
      return {
        recommended: "paranoid",
        desc: "Shared codebase, real users. Every gate on, small waves, pause often.",
        reasons: ["a real `npm test` script exists — gates have something to check", "CI is configured — this repo is shared, not a scratchpad", "7 contributors in history — coordination cost is real", "a project wiki exists — grounding is already cheap"],
        scores: { "solo-fast": 0, paranoid: 3, "token-lean": 0 },
      };
    case "/api/overview":
      return { where, doctor, wiki, patterns: patterns, runs_total: runs.total, waiting: runs.runs.filter((r) => r.status === "waiting").map((r) => ({ slug: r.slug, updated_ms: r.updated_ms, lane: r.lane })), diy, pact, boundary, wiki_debt: wikiDebt, extra_journal: extraJournal };
    case "/api/pact":
      return pact;
    case "/api/boundary":
      return boundary;
    case "/api/handoff":
      return handoff;
    case "/api/wiki/plan":
      return wikiPlan;
    case "/api/wiki/debt":
      return wikiDebt;
    case "/api/wiki/usage":
      return wikiUsage;
    case "/api/budget/forecast":
      // No plan path → the exit-3 "no forecast possible" state, which is what a
      // first-time user sees and therefore has to be designed too.
      return q && q.plan
        ? budgetForecast
        : { ok: false, reason: "no-plan", hint: "pick a plan file — a forecast from a sentence is a guess that looks computed" };
    case "/api/budget/rates":
      return budgetRates;
    case "/api/budget/actual":
      return { ok: true, run: "store-credit", lane: "orc", trace: "run-orc-store-credit-100826-093012.txt", rows: [{ band: "[40,55)", dispatches: 3, forecast_weighted: 96000, actual_weighted: 138000, diff_pct: 44, tokens: { input: 9000, cache_write: 61000, cache_read: 121000, output: 11000 } }, { band: "[70,80)", dispatches: 1, forecast_weighted: 121000, actual_weighted: 304000, diff_pct: 151, tokens: { input: 12000, cache_write: 98000, cache_read: 240000, output: 24000 } }], actual: { tokens: { input: 21000, cache_write: 159000, cache_read: 361000, output: 35000 }, raw: 576000, weighted: 251100, usd: 7.02 }, cache_read_share: 0.71, unattributed: { blocks: 12, tokens: { input: 900, cache_write: 12000, cache_read: 24000, output: 1100 } }, joined: 17, dispatches: 19 };
    case "/api/aftermath":
      return aftermath;
    case "/api/export":
      return exportState;
    case "/api/runs":
      return runs;
    case "/api/run": {
      if (!q || !q.slug || q.slug === runDetail.slug) return runDetail;
      // A closed run is its OWN detail shape — Reopen instead of Mark as done,
      // and the recorded reason. Without it the closed state exists in the list
      // and nowhere you can click.
      if (q.slug === runDetailClosed.slug) return runDetailClosed;
      const row = runs.runs.find((r) => r.slug === q.slug);
      return {
        ...runDetail,
        slug: q.slug,
        status: (row && row.status) || "done",
        resume: row && row.status === "waiting" ? runDetail.resume : null,
        closed: (row && row.closed) || null,
        stands: { lane: (row && row.lane) || "/orc-mini", phase: (row && row.phase) || "", wave: (row && row.wave) || "" },
      };
    }
    case "/api/wiki":
      return wiki;
    case "/api/wiki/impact":
      return wikiImpact;
    case "/api/patterns":
      return patterns;
    case "/api/gotchas":
      return gotchas;
    // v0.49.1 — the wiki's CONTENTS, the pattern's CONTENTS, and the two gotcha
    // reads the panel needs to preview an eviction and reach the archive.
    case "/api/wiki/docs":
      return wikiDocs;
    case "/api/wiki/show":
      // `--body` is opt-in: the default carries no prose at all.
      return q && q.body ? wikiShow : (({ body, ...rest }) => rest)(wikiShow);
    case "/api/wiki/coverage":
      // Two of them, so 61% AND 100% are both designable. `?full=1` picks the
      // happy one; a state with no fixture is a state nobody has looked at.
      return q && q.full ? wikiCoverageFull : wikiCoverage;
    case "/api/pattern/show": {
      const one = patternShow[(q && q.lang) || "react"] || patternShow.react;
      return q && q.body ? one : (({ body, ...rest }) => rest)(one);
    }
    case "/api/gotchas/archived":
      return gotchasArchived;
    case "/api/gotcha/prune/preview":
      return gotchaPrunePreview;
    case "/api/stats":
      return stats;
    case "/api/diy":
      return diy;
    case "/api/crosslink":
      return crosslink;
    case "/api/mocks":
      return mocks;
    case "/api/mock":
      return mockDetail;
    case "/api/stack":
      return { slugs: ["billing-split"], slug: "billing-split", ambiguous: false, plan: { slug: "billing-split", ready: false, exists: true, plan_path: PROJECT + "/stacked-pr/billing-split/stack-plan.md", layers: 4, ticket: "PAY-2214", problems: ["3 unfilled placeholders (e.g. <risk> <owner> <base>)"] } };
    case "/api/changelog":
      // Two entries, so the modal has to handle a LIST rather than one release —
      // skipping a version is the normal case, not the exotic one.
      return {
        version: "0.43.2",
        latest: "0.44.0",
        update_available: true,
        source: "https://raw.githubusercontent.com/azure-id/orc/main/CHANGELOG.md",
        check_disabled: false,
        fetched: true,
        entries: [
          {
            version: "0.44.0",
            date: "2026-08-09",
            title: "`orc ui`: the guided tour, and an upgrade you can read first",
            body:
              "**A version number is not a reason to upgrade.** The banner now fetches the\n" +
              "changelog from the same branch `orc upgrade` installs from, so what you read\n" +
              "and what you get can never be different releases.\n\n" +
              "- First-run tour over the key surfaces, skippable per project\n" +
              "- The upgrade spotlight clears when you actually reach the preview",
          },
          {
            version: "0.43.3",
            date: "2026-08-08",
            title: "settings stop being a wall",
            body: "Collapsible tiers and a filter across all of them at once.",
          },
        ],
      };
    case "/api/crosslink/kinds":
      // A short slice of the real catalog — enough to design the picker with,
      // including the nested `auth/oidc` whose directory is sanitised to
      // `auth-oidc` on disk. A picker that never sees one cannot be trusted.
      return { kinds: ["grpc", "rest-endpoint", "graphql", "websocket", "message-queue", "webhook", "shared-db", "auth/oidc"] };
    case "/api/experiment":
      // can_launch:false is the fixture-mode state on purpose — a disabled
      // launch button with a reason is a thing that needs designing.
      return {
        lanes: [
          { id: "orc", cmd: "/orc", what: "Full pipeline: intake → plan → scored parallel waves → review → verify → ship." },
          { id: "orc-quick", cmd: "/orc-quick", what: "Ask for anything. Look → ask once → do, and it always asks which agent." },
          { id: "orc-mini", cmd: "/orc-mini", what: "One executor, smoke gate, ship. No full review or verify phase." },
          { id: "orc-wiki", cmd: "/orc-wiki", what: "Build or refresh the project wiki. Expensive; always asks first." },
        ],
        project_root: "/example/project",
        platform: "linux",
        can_launch: false,
      };
    case "/api/learn":
      return { sections: require("../../onboarding-content.js").SECTIONS };
    // The mocked runs are package content, identical on every machine and
    // needing no project — so fixture mode serves the REAL catalogue. A canned
    // copy here could only ever be a worse version of a file sitting next to
    // it, and it would be the one thing on this panel that could go stale.
    case "/api/mockruns":
      return require("../../mockrun-catalog.js").catalogue();
    case "/api/mockrun": {
      const doc = require("../../mockrun-catalog.js").get(String((q && q.slug) || ""));
      return doc ? { ...doc, found: true } : { slug: String((q && q.slug) || ""), found: false };
    }
    case "/api/fs/list":
      // The folder picker on canned data. It carries the states that are hard
      // to reach on a tidy machine: a plain folder, a git repo WITHOUT a wiki
      // (the case that saves an inert edge), a repo with one, and the project
      // itself — which the picker must refuse.
      return {
        path: "/example",
        parent: "/",
        sep: "/",
        home: "/home/dev",
        project_root: PROJECT,
        is_project_root: false,
        relative: "..",
        truncated: false,
        dirs: [
          { name: "payments-core", path: "/example/payments-core", is_repo: true, has_wiki: true },
          { name: "storefront-web", path: "/example/storefront-web", is_repo: true, has_wiki: false },
          { name: "ledger-batch", path: "/example/ledger-batch", is_repo: true, has_wiki: false },
          { name: "project", path: PROJECT, is_repo: true, has_wiki: true },
          { name: "scratch", path: "/example/scratch", is_repo: false, has_wiki: false },
        ],
      };
    case "/api/maintenance":
      return {
        actions: [
          { id: "update", label: "Re-copy this package's payload over the installed one", command: "orc update", network: false, names_files: false },
          { id: "prune", label: "Update AND delete ORC-named orphans from a pre-manifest install", command: "orc update --prune", network: false, names_files: true },
          { id: "fix", label: "Apply every fix orc doctor found (= update + prune + settings re-merge)", command: "orc doctor --fix", network: false, names_files: false },
          { id: "upgrade", label: "Fetch the LATEST package from the network, then apply it", command: "orc upgrade", network: true, names_files: false },
          { id: "update-global", label: "Re-copy this package's payload over the GLOBAL install in ~/.claude", command: "orc update --global", network: false, names_files: false, advanced: true },
        ],
      };
    case "/api/maintenance/preview":
      return {
        action: q.action,
        label: "Preview (fixtures)",
        command:
          "orc " +
          (q.action === "prune"
            ? "update --prune"
            : q.action === "fix"
              ? "doctor --fix"
              : q.action === "upgrade"
                ? "upgrade"
                : q.action === "update-global"
                  ? "update --global"
                  : "update"),
        network: q.action === "upgrade",
        names_files: q.action === "prune",
        advanced: q.action === "update-global",
        preview_command: q.action === "update-global" ? "orc doctor --global" : "orc doctor",
        preview: doctor,
        // Derived from the SAME list the Runs panel renders, so a run closed in
        // the fixture set stops blocking the preview here too — which is the
        // whole point of the v0.49.2 fix.
        waiting_runs: runs.runs.filter((r) => r.status === "waiting").map((r) => r.slug),
        dirty_tree: true,
      };
    // v0.50.0 — `orc extra`. One of every state, including the ugly ones: a
    // stale catalog, a vault part-way through its countdown, a vault that
    // deleted itself, a missing environment key, overlapping route rows and a
    // routed model the provider no longer lists.
    // v0.51.0 — the SETUP GATE has three states and each is reachable here:
    // `?gate=none` is nothing connected, `?gate=untested` is a connection that
    // has never answered, and the default is the gate open. Without all three
    // you cannot design the panel a first-time user actually sees.
    case "/api/extra": {
      // The panel sends no query on this read, so a query-only switch would put
      // the two shut-gate states somewhere nobody could ever look at them —
      // which is the exact failure --fixtures exists to prevent. `ORC_UI_FIXTURE_GATE`
      // makes both reachable in the running panel:
      //   ORC_UI_FIXTURE_GATE=none      nothing connected at all
      //   ORC_UI_FIXTURE_GATE=untested  connected, never answered
      const g = (q && q.gate) || process.env.ORC_UI_FIXTURE_GATE || "";
      return g === "none" ? extraListNoConnection : g === "untested" ? extraListNeverTested : extraList;
    }
    // v0.51.0 — the four LOCAL TOOL states, the three credential routes, and
    // both model-entry shapes.
    case "/api/extra/tools":
      return extraTools;
    case "/api/extra/keyhelp":
      return q && q.profile === "local" ? extraKeyhelp.env : extraKeyhelp.login;
    case "/api/extra/models":
      return q && q.profile === "custom" ? extraModels.freeText : extraModels.list;
    case "/api/extra/providers":
      return extraProviders;
    case "/api/extra/doctor":
      return extraDoctor;
    case "/api/extra/route":
      return extraRoute;
    case "/api/extra/lanes":
      return extraLanes;
    case "/api/extra/stats":
      return extraStats;
    case "/api/extra/rates":
      return extraRates;
    // v0.54.0 — RECOVERY. One reconcile fixture per state, including the ugly
    // ones: an `in-flight` REFUSAL, a `reverted` block, a `streamed-opaque`
    // journal with no per-turn attribution to render, and a `no-journal` answer
    // for a dispatch that predates the feature.
    case "/api/extra/journal":
      return extraJournal;
    case "/api/extra/reconcile":
      return extraReconcile[String((q && q.task) || "")] || extraReconcile["T-12"];
    case "/api/extra/journal/prune/preview":
      return extraJournalPrune;
    case "/api/extra/show":
      return {
        ok: true,
        profile: extraList.profiles.find((p) => p.name === (q && q.profile)) || extraList.profiles[0],
        catalog: null,
        history: [],
      };
    case "/api/job":
      return { id: null, running: false };
    default:
      return undefined;
  }
};

// ── the states below are referenced above; declared after for readability ───

// The POST half (v0.50.0). Almost every mutation in fixture mode answers "nothing
// ran" and that is the honest answer — but the CONNECTION TEST'S OUTCOME is a
// state this panel is largely about, and a state you cannot design if the wire
// never lands. So exactly one route has canned answers, chosen deterministically
// from the profile so they agree with what the list already claims.
//
// A route with no entry here still gets the ordinary "nothing ran" reply.
module.exports.post = function post(route, body) {
  // `add` answers OK so the CONNECT FLOW can be walked end to end in fixture
  // mode — the add is only the step before the test, and the test's outcome is
  // the state worth designing. Every other write still answers "nothing ran".
  if (route === "/api/extra/add") return { exit_code: 0, data: { ok: true, next: "orc extra ping" } };
  // v0.51.0 — a launch that could NOT happen and one that did. Both are exit 0,
  // because "no terminal here" is an ANSWER carrying the command to paste.
  if (route === "/api/extra/install")
    return {
      exit_code: 0,
      data: (body && body.provider) === "codex" ? extraInstall.refused : extraInstall.launched,
    };
  if (route === "/api/extra/models/test")
    return { exit_code: 0, data: { ok: true, test: extraPingLive } };
  if (route !== "/api/extra/ping") return undefined;
  const profile = String((body && body.profile) || "");
  if (body && body.key && !body.passphrase) return { exit_code: 0, data: { ...extraPingSaveOffer, profile } };
  // v0.51.0 — the PAID rung has THREE outcomes worth designing and each is
  // reachable: it worked and still cannot say which model answered, the model
  // was LISTED and is DEAD upstream, and the tool is not installed at all.
  if (route === "/api/extra/ping" && body && body.live) {
    if (profile === "toolc") return { exit_code: 1, data: { ...extraPingNotInstalled, profile } };
    if (String(body.model || "").indexOf("free") !== -1)
      return { exit_code: 1, data: { ...extraPingDeadModel, profile } };
    return { exit_code: 0, data: { ...extraPingLive, profile: profile || extraPingLive.profile } };
  }
  if (profile === "router" || profile === "burned") return { exit_code: 1, data: { ...extraPingBad, profile } };
  return { exit_code: 0, data: { ...extraPingOk, profile: profile || extraPingOk.profile } };
};
