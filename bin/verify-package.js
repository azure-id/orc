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
  "templates/skills/orc-diy/SKILL.md",
  "templates/skills/orc-diy/README.md",
  "templates/skills/orc-diy/references/compile.md",
  "templates/skills/orc-diy/references/flow-schema.md",
  "templates/skills/orc-diy/references/locked-blocks.md",
  "templates/skills/orc-diy/references/blocks/header.md",
  "templates/commands/orc.md",
  "templates/commands/orc-diy.md",
  "templates/commands/orc-ultra.md",
  "templates/commands/orc-fast.md",
  "templates/commands/orc-claude.md",
  "templates/commands/orc-learn.md",
  "templates/commands/orc-poly.md",
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
  "templates/agents/orc-context-combiner-opus-5-high.md",
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
// Floors sit just below current reality (23 skills / 30 agent files: +2 new
// executors haiku-4-5 & opus-5-high, +5 fable-5 role agents, +1 trace writer)
// so a tree missing a chunk of the payload fails the count check instead of
// sliding under an ancient floor.
if (skillCount < 22) missing.push(`templates/skills (expected >=22 SKILL.md, found ${skillCount})`);
if (agentCount < 29) missing.push(`templates/agents (expected >=29 .md, found ${agentCount})`);

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
