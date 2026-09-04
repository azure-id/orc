#!/usr/bin/env node
"use strict";
/**
 * Package integrity check. Fails LOUDLY if any critical file is missing —
 * so an incomplete push (e.g. corrupted by OneDrive sync) errors immediately
 * instead of installing a dangling `orc` command.
 * Runs on prepack (before publish/pack) and can be run manually: node bin/verify-package.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const required = [
  "bin/cli.js",
  "package.json",
  "README.md",
  // The `orc ui` web panel (v0.43.0). Named file by file, not covered by a
  // count: the panel is a set of files that only work together, and a publish
  // missing any one of them serves a page that 500s or renders blank. NOTE the
  // folder — `bin/ui.js` is the TERMINAL styling kit and is a different thing.
  "bin/webui/serve.js",
  "bin/webui/api.js",
  "bin/webui/app.html",
  // The stylesheet layers (v0.48.1). The <link> order in app.html is the
  // cascade order; 06-responsive and 04-motion are last on purpose.
  "bin/webui/css/00-tokens.css",
  "bin/webui/css/01-base.css",
  "bin/webui/css/02-shell.css",
  "bin/webui/css/03-components.css",
  "bin/webui/css/04-motion.css",
  "bin/webui/css/05-tour.css",
  "bin/webui/css/06-responsive.css",
  "bin/webui/css/panels/overview.css",
  "bin/webui/css/panels/settings.css",
  "bin/webui/css/panels/lanes.css",
  "bin/webui/css/panels/runs.css",
  "bin/webui/css/panels/knowledge.css",
  // No knowledge.css: that panel is composed entirely from shared primitives
  // (.card, .chip, .tbl, .bar-track). An empty stylesheet would be one more
  // request and one more thing to keep in the manifest for no rules at all.
  "bin/webui/css/panels/stats.css",
  "bin/webui/css/panels/flow.css",
  "bin/webui/css/panels/crosslink.css",
  "bin/webui/css/panels/learn.css",
  "bin/webui/css/panels/mockrun.css",
  "bin/webui/css/panels/maintenance.css",
  "bin/webui/css/panels/pact.css",
  "bin/webui/css/panels/boundary.css",
  "bin/webui/css/panels/wait.css",
  "bin/webui/css/panels/hookui.css",
  "bin/webui/css/panels/handoff.css",
  "bin/webui/css/panels/challenge.css",
  "bin/webui/css/panels/docs.css",
  "bin/webui/css/panels/extra.css",
  "bin/webui/css/panels/experiment.css",
  // The client modules (v0.48.1). The <script> order in app.html is the load
  // order and the numeric prefix is that order; 99-boot.js must be last.
  "bin/webui/js/00-core.js",
  "bin/webui/js/01-i18n.js",
  "bin/webui/js/02-ui.js",
  "bin/webui/js/03-md.js",
  "bin/webui/js/04-router.js",
  "bin/webui/js/05-banners.js",
  "bin/webui/js/06-edit.js",
  "bin/webui/js/panels/overview.js",
  "bin/webui/js/panels/settings.js",
  "bin/webui/js/panels/lanes.js",
  "bin/webui/js/panels/runs.js",
  "bin/webui/js/panels/knowledge.js",
  "bin/webui/js/panels/stats.js",
  "bin/webui/js/panels/flow.js",
  "bin/webui/js/panels/crosslink.js",
  "bin/webui/js/panels/learn.js",
  "bin/webui/js/panels/mockrun.js",
  "bin/webui/js/panels/experiment.js",
  "bin/webui/js/panels/maintenance.js",
  "bin/webui/js/panels/pact.js",
  "bin/webui/js/panels/boundary.js",
  "bin/webui/js/panels/wait.js",
  "bin/webui/js/panels/hookui.js",
  "bin/webui/js/panels/handoff.js",
  "bin/webui/js/panels/challenge.js",
  "bin/webui/js/panels/docs.js",
  "bin/webui/js/panels/extra.js",
  "bin/webui/js/90-tour.js",
  "bin/webui/js/91-shortcuts.js",
  "bin/webui/js/99-boot.js",
  // The canned data (v0.48.1), one file per panel. index.js is the ROUTER;
  // every other file is data. --fixtures must carry ONE OF EVERY STATE.
  "bin/webui/fixtures/index.js",
  "bin/webui/fixtures/shell.js",
  "bin/webui/fixtures/settings.js",
  "bin/webui/fixtures/lanes.js",
  "bin/webui/fixtures/knowledge.js",
  "bin/webui/fixtures/runs.js",
  "bin/webui/fixtures/stats.js",
  "bin/webui/fixtures/pact.js",
  "bin/webui/fixtures/boundary.js",
  "bin/webui/fixtures/wait.js",
  "bin/webui/fixtures/hookui.js",
  "bin/webui/fixtures/handoff.js",
  "bin/webui/fixtures/maintenance.js",
  "bin/webui/fixtures/challenge.js",
  "bin/webui/fixtures/docs.js",
  "bin/webui/fixtures/flow.js",
  "bin/webui/fixtures/crosslink.js",
  "bin/webui/fixtures/mockrun.js",
  "bin/webui/fixtures/extra.js",
  // The string tables (v0.43.6). Named here for the same reason: English is the
  // FALLBACK table every other language falls back to, so a publish that drops
  // it renders raw dotted keys on every panel, in every language.
  // v0.52.0 - the TERM LIST. It is not a string table and is never fetched by
  // the page; it is the one page that keeps the next two hundred strings
  // consistent, and without it a wording pass drifts back within two releases.
  "bin/webui/i18n/TERMS.md",
  "bin/webui/i18n/en/common.json",
  "bin/webui/i18n/en/nav.json",
  "bin/webui/i18n/en/banner.json",
  "bin/webui/i18n/en/overview.json",
  "bin/webui/i18n/en/settings.json",
  "bin/webui/i18n/en/lanes.json",
  "bin/webui/i18n/en/runs.json",
  "bin/webui/i18n/en/knowledge.json",
  "bin/webui/i18n/en/stats.json",
  "bin/webui/i18n/en/flow.json",
  "bin/webui/i18n/en/crosslink.json",
  "bin/webui/i18n/en/learn.json",
  "bin/webui/i18n/en/mockrun.json",
  "bin/webui/i18n/en/maintenance.json",
  "bin/webui/i18n/en/pact.json",
  "bin/webui/i18n/en/boundary.json",
  "bin/webui/i18n/en/wait.json",
  "bin/webui/i18n/en/hookui.json",
  "bin/webui/i18n/en/handoff.json",
  "bin/webui/i18n/en/challenge.json",
  "bin/webui/i18n/en/docs.json",
  "bin/webui/i18n/en/extra.json",
  "bin/webui/i18n/en/experiment.json",
  "bin/webui/i18n/en/tour.json",
  "bin/webui/i18n/id/common.json",
  "bin/webui/i18n/id/nav.json",
  "bin/webui/i18n/id/banner.json",
  "bin/webui/i18n/id/overview.json",
  "bin/webui/i18n/id/settings.json",
  "bin/webui/i18n/id/lanes.json",
  "bin/webui/i18n/id/runs.json",
  "bin/webui/i18n/id/knowledge.json",
  "bin/webui/i18n/id/stats.json",
  "bin/webui/i18n/id/flow.json",
  "bin/webui/i18n/id/crosslink.json",
  "bin/webui/i18n/id/learn.json",
  "bin/webui/i18n/id/mockrun.json",
  "bin/webui/i18n/id/maintenance.json",
  "bin/webui/i18n/id/pact.json",
  "bin/webui/i18n/id/boundary.json",
  "bin/webui/i18n/id/wait.json",
  "bin/webui/i18n/id/hookui.json",
  "bin/webui/i18n/id/handoff.json",
  "bin/webui/i18n/id/challenge.json",
  "bin/webui/i18n/id/docs.json",
  "bin/webui/i18n/id/extra.json",
  "bin/webui/i18n/id/experiment.json",
  "bin/webui/i18n/id/tour.json",
  // The mocked runs (v0.46.x): the catalogue module plus the folder it reads.
  // Both `orc mock-run` and the panel's Mocked Skill Use page are empty without
  // them, and an empty catalogue looks like a broken feature rather than a
  // publish that dropped a folder.
  "bin/mockrun-catalog.js",
  // The two DATED data files (v0.50.0). Both ship inside the package and both
  // are load-bearing on absence rather than on content: without the catalog
  // `orc extra providers` is a packaging bug it reports as one, and without the
  // price table every `usd` reads as an em dash forever. They are named here for
  // the same reason every webui file is — a publish that drops one serves a
  // feature that looks broken rather than missing.
  "bin/providers.json",
  "bin/pricing.json",
  "mock-run",
  "mock-run/INDEX.md",
  "templates",
  "templates/skills/orc/SKILL.md",
  "templates/skills/orc/references/ultra-mode.md",
  "templates/skills/orc-advisor/SKILL.md",
  "templates/skills/orc-judge/SKILL.md",
  "templates/skills/orc-fast/SKILL.md",
  "templates/skills/orc-claude/SKILL.md",
  "templates/skills/orc-claude/references/template.md",
  "templates/skills/orc-claude/references/refresh.md",
  "templates/skills/orc-wiki/references/staleness.md",
  "templates/skills/orc-learn/SKILL.md",
  "templates/skills/orc-learn/references/refresh.md",
  "templates/skills/orc-poly/SKILL.md",
  "templates/skills/orc-poly/references/poly-spec.md",
  "templates/skills/orc-poly/references/gather.md",
  // Stacked pull requests (v0.37.0) — two standalone lanes plus the three
  // canonical shared contracts they and ORC's ship gate all read. A missing
  // shared file makes the ship gate hand off to a lane that cannot preflight.
  "templates/skills/orc-pr-setup/SKILL.md",
  "templates/skills/orc-pr-setup/README.md",
  "templates/skills/orc-pr-setup/references/layer-taxonomy.md",
  "templates/skills/orc-pr-setup/references/certainty-gate.md",
  "templates/skills/orc-pr-driver/SKILL.md",
  "templates/skills/orc-pr-driver/README.md",
  "templates/skills/orc-pr-driver/references/green-gate.md",
  "templates/skills/orc-pr-driver/references/orc-run-split.md",
  "templates/skills/orc-pr-driver/references/conflict-playbook.md",
  "templates/skills/_shared/stack-plan.md",
  "templates/skills/_shared/gh-stack-commands.md",
  "templates/skills/_shared/pr-templates.md",
  "templates/skills/orc/subskills/orc-pr/stack-gate.md",
  "templates/skills/orc-diy/SKILL.md",
  "templates/skills/orc-diy/README.md",
  "templates/skills/orc-diy/references/compile.md",
  "templates/skills/orc-diy/references/flow-schema.md",
  "templates/skills/orc-diy/references/locked-blocks.md",
  "templates/skills/orc-diy/references/blocks/header.md",
  "templates/skills/orc-quick/SKILL.md",
  "templates/skills/orc-quick/README.md",
  "templates/skills/orc-quick/references/context-doc.md",
  "templates/skills/orc-quick/references/dispatch-gate.md",
  "templates/skills/orc-quick/references/gh-mode.md",
  // Quality-of-life lanes (v0.42.0). Three skills, ZERO new agents — the grill
  // dispatches read-only recon ad-hoc (the orc-quick precedent) and the other
  // two dispatch nothing at all. `_shared/interview.md` is the canonical
  // mechanic both the grill and intake.md run; a missing copy of it makes the
  // grill a lane with no procedure.
  "templates/skills/_shared/interview.md",
  "templates/skills/orc-grill/SKILL.md",
  "templates/skills/orc-grill/references/grill-doc.md",
  // v0.45.0 — /orc-brainstorm, again with ZERO new agents. `lane-suspend.md` is
  // the RETURN-TO contract BOTH halves of the brainstorm↔grill trip read: a
  // publish missing it leaves a lane that suspends into another lane with no
  // definition of how (or whether) it comes back. `lenses.md` is the only place
  // ORC generates options on purpose — without it B2 is a mood, not a phase.
  "templates/skills/_shared/lane-suspend.md",
  "templates/skills/orc-brainstorm/SKILL.md",
  "templates/skills/orc-brainstorm/references/brainstorm-doc.md",
  "templates/skills/orc-brainstorm/references/lenses.md",
  "templates/commands/orc-brainstorm.md",
  // v0.46.0 — the six new lanes. Named file by file for the same reason the
  // panel's files are: each SKILL.md is useless without its references (a lane
  // whose card/ledger/surface shape is missing dispatches against a contract it
  // cannot read), and the two CONSUMER gate files are what /orc loads at Phase 1
  // — a publish that drops one leaves the spine pointing at nothing.
  "templates/skills/orc-pact/SKILL.md",
  "templates/skills/orc-pact/references/ledger.md",
  "templates/skills/orc-pact/references/gate.md",
  "templates/skills/orc-boundary/SKILL.md",
  "templates/skills/orc-boundary/references/card.md",
  "templates/skills/orc-boundary/references/gate.md",
  "templates/skills/orc-handoff/SKILL.md",
  "templates/skills/orc-handoff/references/surfaces.md",
  "templates/skills/orc-handoff/references/handoff-log.md",
  "templates/skills/orc-budget/SKILL.md",
  "templates/skills/orc-budget/references/corpus.md",
  "templates/skills/orc-aftermath/SKILL.md",
  "templates/skills/orc-aftermath/references/report.md",
  "templates/skills/orc-export/SKILL.md",
  // W1 — the partial-refresh reference is the whole tier ladder + the budget cap
  // + the retirement offer; without it orc-wiki's spine points at a missing file
  // at exactly the moment it has to choose which scanner to dispatch.
  "templates/skills/orc-wiki/references/partial-refresh.md",
  // v0.47.0 — /orc-challenge. Named file by file for the reason every lane's
  // files are: the SKILL.md is a spine and its references ARE the contract. A
  // publish that drops `sealed-slice.md` ships a judge whose slice has no
  // definition, which is the one thing this lane exists to prevent; a publish
  // that drops `intake.md` ships a lane with no goal contract, so rule 0 becomes
  // a sentence nobody can act on.
  "templates/skills/orc-challenge/SKILL.md",
  "templates/skills/orc-challenge/README.md",
  "templates/skills/orc-challenge/references/intake.md",
  "templates/skills/orc-challenge/references/dimensions.md",
  "templates/skills/orc-challenge/references/kinds.md",
  "templates/skills/orc-challenge/references/rubric.md",
  "templates/skills/orc-challenge/references/sealed-slice.md",
  "templates/skills/orc-challenge/references/cycle-state.md",
  "templates/skills/orc-challenge/references/verdict-doc.md",
  "templates/skills/orc-challenge/references/fix-brief.md",
  "templates/skills/orc-challenge/references/plain-english.md",
  "templates/skills/orc-challenge/references/conservation.md",
  // v0.49.1 — the council's canonical prose. The spine keeps the token and a
  // pointer; this file is the one copy (the `_shared/` discipline).
  "templates/skills/orc-challenge/references/council.md",
  "templates/skills/orc-challenge/examples/council-full-roster.md",
  // v0.48.0 — /orc-doc. Named file by file for the reason every lane's files
  // are: `chunking.md` IS the token architecture (a publish that drops it ships
  // an orchestrator with no definition of what it may hold, which is the one
  // thing this lane exists to bound), `resume-protocol.md` is the whole reason
  // the context is frozen, and `templates/` is the five base skeletons the
  // batching table is pinned to by a golden test.
  "templates/skills/orc-doc/SKILL.md",
  "templates/skills/orc-doc/README.md",
  "templates/skills/orc-doc/references/gates.md",
  "templates/skills/orc-doc/references/chunking.md",
  "templates/skills/orc-doc/references/resume-protocol.md",
  "templates/skills/orc-doc/references/portable-markdown.md",
  "templates/skills/orc-doc/references/plain-language.md",
  "templates/skills/orc-doc/references/import-targets.md",
  // v0.49.2 — the project's own house rules, and ORC's own generation rules.
  // Two files because they are read in that ORDER and the order is the contract.
  "templates/skills/orc-doc/references/house-rules.md",
  "templates/skills/orc-doc/references/generation-rules.md",
  "templates/skills/orc-doc/references/templates/prd.md",
  "templates/skills/orc-doc/references/templates/tsd.md",
  "templates/skills/orc-doc/references/templates/collaboration.md",
  "templates/skills/orc-doc/references/templates/report.md",
  "templates/skills/orc-doc/references/templates/workflow.md",
  "templates/commands/orc-doc.md",
  "templates/commands/orc-challenge.md",
  "templates/commands/orc-pact.md",
  "templates/commands/orc-boundary.md",
  "templates/commands/orc-handoff.md",
  "templates/commands/orc-budget.md",
  "templates/commands/orc-aftermath.md",
  "templates/commands/orc-export.md",
  "templates/skills/orc-route/SKILL.md",
  "templates/skills/orc-explain/SKILL.md",
  "templates/skills/orc-analyze/references/thin-input.md",
  // v1.0.0 W7 — the ONE config doc. `orc/config.md` stopped restating 72 key
  // defaults and now points here for the ranks, the families, the gates, the
  // `announce[]` boundary and the CLI-absent floor. A publish missing this file
  // leaves every lane's `## Config` section pointing at nothing — and the
  // fallback that is supposed to fire when the CLI cannot answer is exactly the
  // moment there is no CLI to ask instead.
  "templates/skills/_shared/config-precedence.md",
  // v1.0.0 W11 — the phase library. The shared phase material already existed
  // and was already shared; it just lived in ONE lane's private folder with 26
  // other lanes reaching across into it. A publish missing any of these leaves
  // every one of those lanes pointing at nothing — and `trace.md` in particular
  // is the file that says how a run records itself, so its absence is silent by
  // construction. README.md carries the CLOSED layer set, which is what stops a
  // trimmed lane reading a full-lane procedure.
  "templates/skills/_shared/phases/README.md",
  "templates/skills/_shared/phases/trace.md",
  "templates/skills/_shared/phases/preflight.md",
  "templates/skills/_shared/phases/stop-resume.md",
  // v1.0.0 W12 — the seven files that were already SHARED while living in one
  // lane's private `references/`. Their consumers are measured, not believed:
  // the C.6 lint asserts every declared reader really points at the file.
  "templates/skills/_shared/phases/intake.md",
  "templates/skills/_shared/phases/plan-handoff.md",
  "templates/skills/_shared/phases/wave-grouping.md",
  "templates/skills/_shared/phases/analyst-gates.md",
  "templates/skills/_shared/phases/wiki-consult.md",
  "templates/skills/_shared/phases/security-checklist.md",
  "templates/skills/_shared/phases/house-rules.md",
  // v1.0.0 W13 — the ten build phases orc-diy became the second reader of.
  // Each carries TWO layers: `full` (/orc's procedure) and `composed` (what
  // `orc diy compile` stitches). A publish missing one breaks BOTH lanes, and
  // breaks orc-diy loudly — the compiler names the file and refuses.
  "templates/skills/_shared/phases/planning.md",
  "templates/skills/_shared/phases/scoring.md",
  "templates/skills/_shared/phases/execution.md",
  "templates/skills/_shared/phases/review.md",
  "templates/skills/_shared/phases/security.md",
  "templates/skills/_shared/phases/verify.md",
  "templates/skills/_shared/phases/testgen.md",
  "templates/skills/_shared/phases/mock-example.md",
  "templates/skills/_shared/phases/summary.md",
  "templates/skills/_shared/phases/ship.md",
  // v1.0.0 W12 — /orc's own phase bodies, W13 — down to the two nothing else
  // runs. The spine is loaded IN FULL on activation and these are loaded when
  // their phase fires; a publish missing one leaves the manifest naming a file
  // that is not there, which is a phase that silently does nothing.
  "templates/skills/orc/references/phases/intake.md",
  "templates/skills/orc/references/phases/integration.md",
  // v1.0.0 W14 — orc-wiki's five phase bodies. A wiki run reaches FEW of them
  // (Phase 0 auto-branches into fresh / resume / refresh / repair, 3c is a legacy
  // backfill), which is what makes a file per phase pay here and not elsewhere.
  // A publish missing one leaves the manifest naming a file that is not there.
  "templates/skills/orc-wiki/references/phases/phase-0.md",
  "templates/skills/orc-wiki/references/phases/phase-1.md",
  "templates/skills/orc-wiki/references/phases/phase-2.md",
  "templates/skills/orc-wiki/references/phases/phase-3.md",
  "templates/skills/orc-wiki/references/phases/phase-3c.md",
  "templates/commands/orc-grill.md",
  "templates/commands/orc-route.md",
  "templates/commands/orc-explain.md",
  "templates/commands/orc.md",
  "templates/commands/orc-quick.md",
  "templates/commands/orc-diy.md",
  "templates/commands/orc-ultra.md",
  "templates/commands/orc-fast.md",
  "templates/commands/orc-claude.md",
  "templates/commands/orc-learn.md",
  "templates/commands/orc-poly.md",
  "templates/commands/orc-pr-setup.md",
  "templates/commands/orc-pr-driver.md",
  "templates/agents/MODEL-MAPPING.md",
  "templates/agents/orc-advisor-opus-5-xhigh.md",
  "templates/agents/orc-judge-opus-5-xhigh.md",
  "templates/agents/orc-claude-writer-opus-4-8-high.md",
  "templates/agents/orc-learn-writer-opus-5-low.md",
  "templates/agents/orc-trace-writer-haiku-4-5.md",
  // Core non-generated agents — named explicitly so a dropped file is REPORTED
  // by name, not merely absorbed by the count floor. (The 8 executor agents are
  // checked separately by `build-agents.js --check`.)
  "templates/agents/orc-system-analyst-opus-5-high.md",
  "templates/agents/orc-planner-opus-5-med.md",
  "templates/agents/orc-reviewer-opus-5-med.md",
  "templates/agents/orc-verifier-opus-5-med.md",
  "templates/agents/orc-scout-sonnet-4-6-high.md",
  "templates/agents/orc-test-author-opus-5-med.md",
  "templates/agents/orc-pattern-codifier-sonnet-5-high.md",
  "templates/agents/orc-retro-sonnet-5-high.md",
  "templates/agents/orc-wiki-scanner-opus-4-8-high.md",
  // v0.46.0 — the LIGHT half of the wiki scan tier ladder. Both halves must ship:
  // the ladder resolves at dispatch time, so a missing light scanner makes every
  // small-delta refresh dispatch a nonexistent agent.
  "templates/agents/orc-wiki-scanner-sonnet-5-high.md",
  "templates/agents/orc-context-combiner-opus-5-high.md",
  // The orc-mini lane's agent pair and the whole Fable 5 role-override feature
  // were guarded by nothing but the count floor — a publish missing any of them
  // ships a lane that dispatches a nonexistent agent.
  "templates/agents/orc-analyze-mini-sonnet-5-high.md",
  "templates/agents/orc-planner-mini-sonnet-5-high.md",
  // The Opus-5-only mode roster (v0.36.0). Both halves of every pair must ship:
  // the mode is a runtime toggle, so a missing variant makes `opus5_only: true`
  // dispatch a nonexistent agent for that role.
  "templates/agents/orc-analyze-mini-opus-5-med.md",
  "templates/agents/orc-planner-mini-opus-5-med.md",
  "templates/agents/orc-scout-opus-5-low.md",
  "templates/agents/orc-pattern-codifier-opus-5-med.md",
  "templates/agents/orc-wiki-scanner-opus-5-med.md",
  "templates/agents/orc-claude-writer-opus-5-med.md",
  "templates/agents/orc-retro-opus-5-med.md",
  // v0.47.0 — the three /orc-challenge agents. All THREE must ship: a cycle that
  // cannot dispatch the reader silently loses D4, and one that cannot dispatch
  // the advisor turns a FAIL into a list with no order. All three are already
  // Opus 5, so `opus5_only` needs no twin for any of them.
  "templates/agents/orc-challenge-judge-opus-5-high.md",
  "templates/agents/orc-challenge-advisor-opus-5-med.md",
  "templates/agents/orc-challenge-reader-opus-5-low.md",
  // v0.49.1 — THE COUNCIL. Five DIFFERENT INSTRUMENTS, not five tiers of one:
  // the contrarian assumes a fatal flaw, the outsider knows nothing and may not
  // be told, the council executor asks what you do Monday morning, the
  // first-principles thinker disputes the goal itself, and the expansionist is
  // the only lens not looking for a defect. All five must ship: a roster lens
  // that cannot be dispatched is a NOT-RUN row a user paid to select, and rule
  // 15 makes that loud rather than silent. All five are claude-opus-5, so
  // `opus5_only` adds NO pair and the floor moves by exactly five.
  "templates/agents/orc-challenge-contrarian-opus-5-high.md",
  "templates/agents/orc-challenge-outsider-opus-5-low.md",
  "templates/agents/orc-challenge-executor-opus-5-med.md",
  "templates/agents/orc-challenge-principles-opus-5-high.md",
  "templates/agents/orc-challenge-expansionist-opus-5-med.md",
  // v0.48.0 — the two /orc-doc agents. BOTH must ship: a write wave that cannot
  // dispatch the writer has nothing to assemble, and a check wave that cannot
  // dispatch the checker silently turns the only judgment step into the free
  // lint. Both are already Opus 5, so `opus5_only` adds no twin for either.
  "templates/agents/orc-doc-writer-opus-5-med.md",
  "templates/agents/orc-doc-checker-opus-5-low.md",
  // v1.2.1 — the status line explained for the person reading it, in
  // Simplified Technical English. It ships INTO .claude/hooks/ next to the hook
  // it describes, because that is where somebody looking at a segment they do
  // not recognise will look for it.
  "templates/hooks/README.md",
  "templates/hooks/orc-effort-guard.js",
  "templates/hooks/orc-statusline.js",
  // v1.3.0 — THE RENDER ENGINE, and it is required by BOTH halves: the hook
  // requires it as a sibling out of .claude/hooks/, and bin/cli.js requires it
  // out of templates/hooks/ for `orc statusline preview`. That is what makes
  // the panel's preview and the bar's real output byte-identical BY
  // CONSTRUCTION. A missing file here breaks the status line AND the panel.
  "templates/hooks/orc-statusline-render.js",
  "templates/hooks/orc-trace.js",
];

const missing = [];
for (const rel of required) {
  if (!fs.existsSync(path.join(ROOT, rel))) missing.push(rel);
}

// Every skill dir must contain at least one SKILL.md; every agent file must be non-empty.
function walkCount(dir, ext) {
  let n = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += walkCount(p, ext);
    else if (e.name.endsWith(ext)) n += 1;
  }
  return n;
}

const skillCount = walkCount(path.join(ROOT, "templates/skills"), "SKILL.md");
const agentCount = walkCount(path.join(ROOT, "templates/agents"), ".md");
// Floors sit AT current reality (26 skills / 40 agent files: 39 agents +
// MODEL-MAPPING.md — +7 fixed-role variants for the opus5_only mode) so a
// dropped file fails the count check instead of sliding
// into the slack an under-set floor grants. Raise them with the payload.
// v0.38.0: +1 skill (orc-quick) and NO new agent — the quick lane reuses
// shipped executors and dispatches read-only recon ad-hoc by model name.
// v0.42.0: +3 skills (orc-grill, orc-route, orc-explain) and still NO new
// agent — same precedent. The agent floor deliberately does NOT move: a QoL
// lane that needed a pinned agent would also need its opus5_only twin, a
// MODEL-MAPPING row and a golden test, which is why none of them has one.
// v0.45.0: +1 skill (orc-brainstorm) and STILL no new agent — its divergent
// generation is the orchestrator's own work and its recon is dispatched ad-hoc
// by model+effort, so the agent floor holds at 40.
// v0.46.0: +6 skills (orc-pact, orc-boundary, orc-handoff, orc-budget,
// orc-aftermath, orc-export) and +1 agent — and the split is the point. Five of
// the six lanes ship ZERO agents (the v0.38.0/v0.45.0 precedent: read-only recon
// is dispatched ad-hoc by model+effort, and three of them dispatch nothing at
// all because their work is deterministic CLI). The ONE new agent is the wiki
// scan ladder's LIGHT half, which is a real dispatch target with a real name and
// therefore earns a MODEL-MAPPING row, an explicit guard entry above, and a
// place in the opus5_only table's prose.
// v0.47.0: +1 skill (orc-challenge) and +3 agents — the first lane since v0.42.0
// to earn any, and it earns three because each is a DIFFERENT INSTRUMENT, not a
// tier of the same one. The reader is `low` on purpose (a harder-thinking reader
// papers over exactly the gaps D4 measures), the judge is `high` because D2 is
// the only dimension no computer can reach, and the advisor is `medium` because
// grouping findings is pattern work. All three are claude-opus-5, so `opus5_only`
// adds NO pair and the floor moves by exactly three.
// v0.48.0: +1 skill (orc-doc) and +2 agents. The split follows v0.47.0's rule —
// an agent exists when it is a DIFFERENT INSTRUMENT, not a tier of the same one.
// The writer holds one part file and never `document.md`; the checker holds one
// LINE RANGE and has `Read` only. The checker is `low` on purpose (a
// harder-thinking checker reasons its way past a gap a real reader would trip
// on — the challenge cold reader's reasoning), so nothing may upgrade it. Both
// are claude-opus-5, so `opus5_only` adds NO pair and the floor moves by two.
// v0.49.1: +0 skills and +5 agents — THE COUNCIL. Same rule as v0.47.0, applied
// five times: each of these is a DIFFERENT INSTRUMENT, not a tier of one. The
// outsider is `low` and the contrarian is `high` for the same class of reason
// the cold reader is `low` — effort here is a MEASUREMENT choice, not a cost
// one, and a key that let either be tuned would be a key that let the
// instrument be broken. All five are claude-opus-5, so `opus5_only` adds NO
// pair and the floor moves by exactly five.
// v1.0.0 W3: +0 skills and -5 agents — the Fable 5 role override is REMOVED.
// It is the first time this floor has ever gone DOWN, and the reason it may is
// that the five files are not a tier of anything: they were a whole second
// answer to "which model runs a role", competing with `opus5_only` for the same
// decision. Deleting them removes a rank from `fixed-role-model` rather than a
// capability from a lane. Fable 5 survives as a SESSION model (the effort guard
// and the statusline still clear it at medium) — that is a different question,
// and this wave does not touch it.
if (skillCount < 38) missing.push(`templates/skills (expected >=38 SKILL.md, found ${skillCount})`);
if (agentCount < 46) missing.push(`templates/agents (expected >=46 .md, found ${agentCount})`);

// B4 — encoding/mojibake guard. The OneDrive corruption rule becomes a gate:
// scan every shipped text file for the U+FFFD replacement char (invalid UTF-8
// decodes to it) and for a whitespace-flanked run of three-or-more question
// marks — the shape a mangled em/en-dash or curly quote collapses into (a
// space-flanked dash becoming space-Q-Q-Q-space). A genuine "What???" has no
// leading space, so it is not flagged.
const MOJIBAKE = /(^|\s)\?{3,}(\s|$)/;
// U+FFFD needle built from its code point so this scanner never flags its own source.
const REPL = String.fromCharCode(0xfffd);
function scanEncoding(dir, hits) {
  if (!fs.existsSync(dir)) return;
  const st = fs.statSync(dir);
  if (st.isFile()) {
    let text;
    try {
      text = fs.readFileSync(dir, "utf8");
    } catch (_) {
      return; // unreadable → not our concern here
    }
    const rel = path.relative(ROOT, dir).replace(/\\/g, "/");
    // Reference U+FFFD via escape, never as a literal, so this scanner does not
    // flag its own source.
    if (text.includes(REPL)) hits.push(`${rel} (U+FFFD replacement char — corrupted bytes)`);
    else if (MOJIBAKE.test(text)) hits.push(`${rel} (whitespace-flanked "???" — likely mangled dash/quote)`);
    return;
  }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    scanEncoding(path.join(dir, e.name), hits);
  }
}
const encodingHits = [];
scanEncoding(path.join(ROOT, "package.json"), encodingHits);
scanEncoding(path.join(ROOT, "bin"), encodingHits);
scanEncoding(path.join(ROOT, "templates"), encodingHits);
for (const h of encodingHits) missing.push("encoding: " + h);

if (missing.length) {
  console.error("\n❌ ORC package integrity check FAILED. Missing / incomplete:");
  for (const m of missing) console.error("   - " + m);
  console.error("\nDo NOT publish or push this tree. Likely cause: files were not");
  console.error("committed (OneDrive sync can corrupt commits). Rebuild the repo");
  console.error("OUTSIDE any cloud-synced folder, `git add -A`, verify, then push.\n");
  process.exit(1);
}
console.log(`✅ ORC package OK — ${skillCount} skills, ${agentCount} agent files, cli present.`);
