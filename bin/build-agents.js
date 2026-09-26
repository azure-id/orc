#!/usr/bin/env node
"use strict";
/**
 * Agent generator. Two sets, one rule: a file that differs from its siblings
 * ONLY in frontmatter and the "You are … (<model>, <effort>)" line is GENERATED.
 *
 *   1. The 10 executors — agents-src/executor.template.md × VARIANTS
 *      (name/model/effort + score band).
 *   2. The 8 model-twin pairs (v2.0.0 T15) — agents-src/twins/<family>.template.md
 *      × TWINS (name/model/effort/description + the `who` line). One body per
 *      family: before T15 each pair was two hand-kept copies that nothing
 *      checked against each other.
 *
 * Edit the template (or the table), run `npm run build:agents`, and every copy
 * is stamped out identically. A model change is still a RENAME: a new row, not
 * an edited one.
 *
 * Modes:
 *   node bin/build-agents.js          write both sets into templates/agents/
 *   node bin/build-agents.js --check  fail if any generated file drifted from
 *                                     its template (runs in `npm run verify`
 *                                     and prepack — a hand-edit to a generated
 *                                     agent file fails the build)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TEMPLATE = path.join(ROOT, "agents-src", "executor.template.md");
const OUT_DIR = path.join(ROOT, "templates", "agents");

// Score→model bands mirror templates/agents/MODEL-MAPPING.md and the single
// score→model table in skills/orc/config.md (documented drift — change
// together). `effort: null` = a model with NO effort ladder (haiku): the
// generator omits the `effort:` frontmatter line entirely.
//
// v1.0.0 W4 — the table is SIX bands, not eight, and the `opus5_only` ladder is
// TWO, not three. Four of these agents are named by NO default row:
// names them, and they ship anyway (D14). They stay reachable through
// `rubric_bands_override`, `orc diy` `fixed_executor` and `extra_fallback_agent`,
// and deleting a generated file that no row happens to name today would be a
// rename-shaped migration for what is only a table change. Their `band` string
// says so rather than naming a range that no longer exists — a band label that
// lies is worse than one that admits it is unreachable by default.
const VARIANTS = [
  { name: "orc-executor-opus-5-med",     model: "claude-opus-5-5",     effort: "medium", band: "highest-complexity [90,100]" },
  { name: "orc-executor-opus-5-low",     model: "claude-opus-5-5",     effort: "low",    band: "upper-complexity [65,90)" },
  { name: "orc-executor-sonnet-5-high",  model: "claude-sonnet-5",  effort: "high",   band: "mid-complexity [55,65)" },
  { name: "orc-executor-sonnet-4-6-high", model: "claude-sonnet-4-6", effort: "high",  band: "low-mid-complexity [40,55)" },
  { name: "orc-executor-sonnet-4-6-med", model: "claude-sonnet-4-6", effort: "medium", band: "low-complexity [30,40)" },
  { name: "orc-executor-haiku-4-5",      model: "claude-haiku-4-5",  effort: null,     band: "lowest-complexity [0,30)" },
  // NAMED BY NO BAND since v1.0.0 W4 (D14) — kept on disk, dispatched only when a
  // user names one explicitly.
  { name: "orc-executor-opus-5-high",    model: "claude-opus-5-5",    effort: "high",   band: "none (opt-in only, see MODEL-MAPPING.md)" },
  { name: "orc-executor-opus-4-8-high",  model: "claude-opus-4-8",  effort: "high",   band: "none (opt-in only, see MODEL-MAPPING.md)" },
  { name: "orc-executor-opus-4-7-high",  model: "claude-opus-4-7",  effort: "high",   band: "none (opt-in only, see MODEL-MAPPING.md)" },
  { name: "orc-executor-opus-4-7-med",   model: "claude-opus-4-7",  effort: "medium", band: "none (opt-in only, see MODEL-MAPPING.md)" },
];

// v2.0.0 T15 — the model twins. Each family is one template under
// agents-src/twins/; a row fills five placeholders: {{NAME}}, {{MODEL}},
// {{EFFORT}}, {{DESC}} (the one-line frontmatter description) and {{WHO}} (the
// "(Sonnet 5, high)" part of the "You are …" line — absent for a family whose
// body never names its own model). The pair is a runtime choice (`opus5_only`,
// the recon gate, the wiki tier ladder), so both halves always ship.
const TWIN_DIR = path.join(ROOT, "agents-src", "twins");
const TWINS = [
  { family: "analyze-mini", variants: [
    { name: "orc-analyze-mini-sonnet-5-high", model: "claude-sonnet-5", effort: "high", who: "Sonnet 5, high",
      desc: "ORC mini System Analyst — claude-sonnet-5, high effort. Dispatched by /orc-mini and /orc-analyze-mini at analysis: single pass, no deep mode, no scouts." },
    { name: "orc-analyze-mini-opus-5-med", model: "claude-opus-5-5", effort: "medium", who: "Opus 5.5, medium",
      desc: "ORC mini System Analyst — claude-opus-5-5, medium effort. Dispatched by /orc-mini and /orc-analyze-mini, instead of orc-analyze-mini-sonnet-5-high when `opus5_only: true`." },
  ] },
  { family: "planner-mini", variants: [
    { name: "orc-planner-mini-sonnet-5-high", model: "claude-sonnet-5", effort: "high", who: "Sonnet 5, high",
      desc: "ORC mini Requirement Planner — claude-sonnet-5, high effort. Dispatched by /orc-mini at planning." },
    { name: "orc-planner-mini-opus-5-med", model: "claude-opus-5-5", effort: "medium", who: "Opus 5.5, medium",
      desc: "ORC mini Requirement Planner — claude-opus-5-5, medium effort. Dispatched by /orc-mini at planning, instead of orc-planner-mini-sonnet-5-high when `opus5_only: true`." },
  ] },
  { family: "pattern-codifier", variants: [
    { name: "orc-pattern-codifier-sonnet-5-high", model: "claude-sonnet-5", effort: "high",
      desc: "ORC Pattern Codifier — claude-sonnet-5, high effort. Dispatched by orc-pattern (lazy /orc miss, eager orc-wiki, or manual /orc-pattern) for ONE language." },
    { name: "orc-pattern-codifier-opus-5-med", model: "claude-opus-5-5", effort: "medium",
      desc: "ORC Pattern Codifier — claude-opus-5-5, medium effort. Dispatched by orc-pattern, instead of orc-pattern-codifier-sonnet-5-high when `opus5_only: true`." },
  ] },
  { family: "recon", variants: [
    { name: "orc-recon-sonnet-4-6-med", model: "claude-sonnet-4-6", effort: "medium", who: "Sonnet 4.6, medium",
      desc: "ORC Recon — claude-sonnet-4-6, medium effort. Dispatched by /orc-quick at the dispatch gate, for a read-only question. It never edits." },
    { name: "orc-recon-opus-5-low", model: "claude-opus-5-5", effort: "low", who: "Opus 5.5, low",
      desc: "ORC Recon — claude-opus-5-5, low effort. Dispatched by /orc-quick at the dispatch gate, for a WIDE or SUBTLE read-only question. It never edits." },
  ] },
  { family: "retro", variants: [
    { name: "orc-retro-sonnet-5-high", model: "claude-sonnet-5", effort: "high", who: "Sonnet 5, high",
      desc: "ORC Retro miner — claude-sonnet-5, high effort. Dispatched by /orc-retro to mine the behavior traces. Read-only, report-only." },
    { name: "orc-retro-opus-5-med", model: "claude-opus-5-5", effort: "medium", who: "Opus 5.5, medium",
      desc: "ORC Retro miner — claude-opus-5-5, medium effort. Dispatched by /orc-retro, instead of orc-retro-sonnet-5-high when `opus5_only: true`. Read-only." },
  ] },
  { family: "scout", variants: [
    { name: "orc-scout-sonnet-4-6-high", model: "claude-sonnet-4-6", effort: "high", who: "Sonnet 4.6, high",
      desc: "ORC Code Scout — claude-sonnet-4-6, high effort. Dispatched by orc in the analyst's DEEP mode (≤max_scouts in parallel), ONE coverage area each." },
    { name: "orc-scout-opus-5-low", model: "claude-opus-5-5", effort: "low", who: "Opus 5.5, low",
      desc: "ORC Code Scout — claude-opus-5-5, low effort. Dispatched by orc in the analyst's DEEP mode, instead of orc-scout-sonnet-4-6-high when `opus5_only: true`." },
  ] },
  { family: "claude-writer", variants: [
    { name: "orc-claude-writer-opus-4-8-high", model: "claude-opus-4-8", effort: "high", who: "Opus 4.8, high",
      desc: "ORC CLAUDE.md Writer — claude-opus-4-8, high effort. Dispatched by /orc-claude to create, update or refresh the repo-root CLAUDE.md." },
    { name: "orc-claude-writer-opus-5-med", model: "claude-opus-5-5", effort: "medium", who: "Opus 5.5, medium",
      desc: "ORC CLAUDE.md Writer — claude-opus-5-5, medium effort. Dispatched by /orc-claude, instead of orc-claude-writer-opus-4-8-high when `opus5_only: true`." },
  ] },
  { family: "wiki-scanner", variants: [
    { name: "orc-wiki-scanner-opus-4-8-high", model: "claude-opus-4-8", effort: "high",
      desc: "ORC Wiki Scanner — claude-opus-4-8, high effort. Dispatched by orc-wiki per scan-task (DEEP tier), ONE coverage area each." },
    { name: "orc-wiki-scanner-opus-5-med", model: "claude-opus-5-5", effort: "medium",
      desc: "ORC Wiki Scanner — claude-opus-5-5, medium effort. Dispatched by orc-wiki per scan-task, for BOTH tiers when `opus5_only: true`." },
  ] },
];


// Line endings are NOT content here: .gitattributes stores these files with LF
// and checks them out native, so a Windows worktree is CRLF and a Linux one LF.
// The injected frontmatter line therefore borrows the TEMPLATE's own ending, and
// --check compares LF-normalized text — otherwise the guard fails on Windows for
// a difference git itself does not record.
const eolOf = (s) => (/\r\n/.test(s) ? "\r\n" : "\n");
const lf = (s) => s.replace(/\r\n/g, "\n");

function render(template, v) {
  const effortDesc = v.effort ? `, ${v.effort} effort` : " (no effort ladder)";
  const effortFm = v.effort ? `effort: ${v.effort}${eolOf(template)}` : "";
  return template
    .replace(/\{\{NAME\}\}/g, v.name)
    .replace(/\{\{MODEL\}\}/g, v.model)
    .replace(/\{\{EFFORT_DESC\}\}/g, effortDesc)
    .replace(/\{\{EFFORT_FM\}\}/g, effortFm)
    .replace(/\{\{BAND\}\}/g, v.band);
}

function renderTwin(template, v) {
  return template
    .replace(/\{\{NAME\}\}/g, v.name)
    .replace(/\{\{MODEL\}\}/g, v.model)
    .replace(/\{\{EFFORT\}\}/g, v.effort)
    .replace(/\{\{DESC\}\}/g, v.desc)
    .replace(/\{\{WHO\}\}/g, v.who || "");
}

// Every [template, row, renderer] the generator owns, executors first.
function jobs() {
  const template = fs.readFileSync(TEMPLATE, "utf8");
  if (/\{\{(?!NAME|MODEL|EFFORT_DESC|EFFORT_FM|BAND)\w/.test(template)) {
    console.error("❌ build-agents: unknown {{placeholder}} in executor.template.md");
    process.exit(1);
  }
  const out = VARIANTS.map((v) => ({ v, out: render(template, v), src: "agents-src/executor.template.md" }));
  for (const fam of TWINS) {
    const src = "agents-src/twins/" + fam.family + ".template.md";
    const t = fs.readFileSync(path.join(TWIN_DIR, fam.family + ".template.md"), "utf8");
    if (/\{\{(?!(?:NAME|MODEL|EFFORT|DESC|WHO)\}\})\w/.test(t)) {
      console.error("❌ build-agents: unknown {{placeholder}} in " + src);
      process.exit(1);
    }
    if (/\{\{WHO\}\}/.test(t) !==fam.variants.every((v) => v.who)) {
      console.error("❌ build-agents: " + src + " and its TWINS rows disagree about {{WHO}}");
      process.exit(1);
    }
    for (const v of fam.variants) out.push({ v, out: renderTwin(t, v), src });
  }
  return out;
}

function main() {
  const checkMode = process.argv.includes("--check");
  const all = jobs();
  let drifted = 0;
  for (const { v, out, src } of all) {
    const dest = path.join(OUT_DIR, v.name + ".md");
    if (checkMode) {
      const current = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : null;
      if (current === null || lf(current) !== lf(out)) {
        drifted++;
        console.error(
          `❌ generated agent drifted: templates/agents/${v.name}.md\n` +
            `   This agent is GENERATED — edit ${src}\n` +
            `   (or the VARIANTS / TWINS table in bin/build-agents.js) and run: npm run build:agents`
        );
      }
    } else {
      fs.writeFileSync(dest, out);
      console.log(`  gen  templates/agents/${v.name}.md`);
    }
  }

  if (checkMode) {
    if (drifted) process.exit(1);
    const twins = all.length - VARIANTS.length;
    console.log(
      `✅ ORC executor agents OK — ${VARIANTS.length} files match the template; ${twins} model twins match agents-src/twins/.`
    );
  }
}

// Required by test/payload.test.js, which checks the line-ending rule above
// without writing to templates/agents/.
module.exports = { VARIANTS, TWINS, render, renderTwin, lf, eolOf };

if (require.main === module) main();
