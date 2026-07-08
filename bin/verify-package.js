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
  "templates",
  "templates/skills/orc/SKILL.md",
  "templates/commands/orc.md",
  "templates/agents/MODEL-MAPPING.md",
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
if (skillCount < 6) missing.push(`templates/skills (expected >=6 SKILL.md, found ${skillCount})`);
if (agentCount < 12) missing.push(`templates/agents (expected >=12 .md, found ${agentCount})`);

if (missing.length) {
  console.error("\n❌ ORC package integrity check FAILED. Missing / incomplete:");
  for (const m of missing) console.error("   - " + m);
  console.error("\nDo NOT publish or push this tree. Likely cause: files were not");
  console.error("committed (OneDrive sync can corrupt commits). Rebuild the repo");
  console.error("OUTSIDE any cloud-synced folder, `git add -A`, verify, then push.\n");
  process.exit(1);
}
console.log(`✅ ORC package OK — ${skillCount} skills, ${agentCount} agent files, cli present.`);
