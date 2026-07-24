#!/usr/bin/env node
"use strict";
/**
 * Executor-agent generator. The 6 executor agent files differ ONLY in
 * frontmatter (name/model/effort + score band); their body is one shared
 * contract. This script is the single source of truth: edit
 * agents-src/executor.template.md (or the VARIANTS table), run
 * `npm run build:agents`, and every copy is stamped out identically.
 *
 * Modes:
 *   node bin/build-agents.js          write templates/agents/orc-executor-*.md
 *   node bin/build-agents.js --check  fail if any generated file drifted from
 *                                     the template (runs in `npm run verify`
 *                                     and prepack — a hand-edit to a generated
 *                                     executor file fails the build)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TEMPLATE = path.join(ROOT, "agents-src", "executor.template.md");
const OUT_DIR = path.join(ROOT, "templates", "agents");

// Score→model bands mirror templates/agents/MODEL-MAPPING.md and the single
// 8-band score→model table in skills/orc/config.md (documented drift — change
// together). `effort: null` = a model with NO effort ladder (haiku): the
// generator omits the `effort:` frontmatter line entirely.
const VARIANTS = [
  { name: "orc-executor-opus-5-high",    model: "claude-opus-5",    effort: "high",   band: "highest-complexity [90,100]" },
  { name: "orc-executor-opus-4-8-high",  model: "claude-opus-4-8",  effort: "high",   band: "very-high-complexity [80,90)" },
  { name: "orc-executor-opus-4-7-high",  model: "claude-opus-4-7",  effort: "high",   band: "high-complexity [70,80)" },
  { name: "orc-executor-opus-4-7-med",   model: "claude-opus-4-7",  effort: "medium", band: "upper-mid-complexity [65,70)" },
  { name: "orc-executor-sonnet-5-high",  model: "claude-sonnet-5",  effort: "high",   band: "mid-complexity [55,65)" },
  { name: "orc-executor-sonnet-4-6-high", model: "claude-sonnet-4-6", effort: "high",  band: "low-mid-complexity [40,55)" },
  { name: "orc-executor-sonnet-4-6-med", model: "claude-sonnet-4-6", effort: "medium", band: "low-complexity [30,40)" },
  { name: "orc-executor-haiku-4-5",      model: "claude-haiku-4-5",  effort: null,     band: "lowest-complexity [0,30)" },
];

function render(template, v) {
  const effortDesc = v.effort ? `, ${v.effort} effort` : " (no effort ladder)";
  const effortFm = v.effort ? `effort: ${v.effort}\n` : "";
  return template
    .replace(/\{\{NAME\}\}/g, v.name)
    .replace(/\{\{MODEL\}\}/g, v.model)
    .replace(/\{\{EFFORT_DESC\}\}/g, effortDesc)
    .replace(/\{\{EFFORT_FM\}\}/g, effortFm)
    .replace(/\{\{BAND\}\}/g, v.band);
}

const checkMode = process.argv.includes("--check");
const template = fs.readFileSync(TEMPLATE, "utf8");
if (/\{\{(?!NAME|MODEL|EFFORT_DESC|EFFORT_FM|BAND)\w/.test(template)) {
  console.error("❌ build-agents: unknown {{placeholder}} in executor.template.md");
  process.exit(1);
}

let drifted = 0;
for (const v of VARIANTS) {
  const out = render(template, v);
  const dest = path.join(OUT_DIR, v.name + ".md");
  if (checkMode) {
    const current = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : null;
    if (current !== out) {
      drifted++;
      console.error(
        `❌ generated agent drifted: templates/agents/${v.name}.md\n` +
          `   Executor agents are GENERATED — edit agents-src/executor.template.md\n` +
          `   (or bin/build-agents.js VARIANTS) and run: npm run build:agents`
      );
    }
  } else {
    fs.writeFileSync(dest, out);
    console.log(`  gen  templates/agents/${v.name}.md`);
  }
}

if (checkMode) {
  if (drifted) process.exit(1);
  console.log(`✅ ORC executor agents OK — ${VARIANTS.length} files match the template.`);
}
