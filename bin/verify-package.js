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
  "bin/webui/fixtures.js",
  "bin/webui/app.html",
  "bin/webui/app.css",
  "bin/webui/app.js",
  // The string tables (v0.43.6). Named here for the same reason: English is the
  // FALLBACK table every other language falls back to, so a publish that drops
  // it renders raw dotted keys on every panel, in every language.
  "bin/webui/i18n/en.json",
  "bin/webui/i18n/id.json",
  // The mocked runs (v0.46.x): the catalogue module plus the folder it reads.
  // Both `orc mock-run` and the panel's Mocked Skill Use page are empty without
  // them, and an empty catalogue looks like a broken feature rather than a
  // publish that dropped a folder.
  "bin/mockrun-catalog.js",
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
  // v0.48.0 — the two /orc-doc agents. BOTH must ship: a write wave that cannot
  // dispatch the writer has nothing to assemble, and a check wave that cannot
  // dispatch the checker silently turns the only judgment step into the free
  // lint. Both are already Opus 5, so `opus5_only` adds no twin for either.
  "templates/agents/orc-doc-writer-opus-5-med.md",
  "templates/agents/orc-doc-checker-opus-5-low.md",
  "templates/agents/orc-analyst-fable-5.md",
  "templates/agents/orc-planner-fable-5.md",
  "templates/agents/orc-advisor-fable-5.md",
  "templates/agents/orc-judge-fable-5.md",
  "templates/agents/orc-reviewer-fable-5.md",
  "templates/hooks/orc-effort-guard.js",
  "templates/hooks/orc-statusline.js",
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
