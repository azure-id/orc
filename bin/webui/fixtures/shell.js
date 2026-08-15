"use strict";
/* fixtures/shell.js — canned data for `orc ui --fixtures`.
   The project root, `orc where` and `orc doctor` — the three every panel reads.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const PROJECT = "/example/project";

const doctor = {
  ok: false,
  claude_dir: PROJECT + "/.claude",
  installed_version: "0.41.0",
  package_version: "0.43.0",
  global_install: { present: true, version: "0.39.0", shadows: true },
  findings: [
    { id: "version-skew", severity: "warn", message: "payload version 0.41.0 != CLI 0.43.0 — run `orc update`", fixable: true, installed_version: "0.41.0", package_version: "0.43.0" },
    { id: "global-skew", severity: "warn", message: "GLOBAL install ~/.claude is 0.39.0 but this project is 0.41.0 — the global copy can win skill resolution; run `orc update --global`", fixable: false, global_version: "0.39.0", local_version: "0.41.0" },
    { id: "orphan", severity: "warn", message: "2 orphan(s) from a prior payload: agents/orc-executor-opus-4-8-med.md, skills/orc-old/SKILL.md — `orc update`", fixable: true, paths: ["agents/orc-executor-opus-4-8-med.md", "skills/orc-old/SKILL.md"] },
    { id: "statusline-missing", severity: "warn", message: "no statusLine — the non-Opus/high model warning won't show; run `orc update`", fixable: true },
  ],
  fixable: true,
};

const where = {
  claude_dir: PROJECT + "/.claude",
  project_root: PROJECT,
  package_root: "/usr/lib/node_modules/orc",
  package_version: "0.43.0",
  installed_version: "0.41.0",
  skills: PROJECT + "/.claude/skills",
  commands: PROJECT + "/.claude/commands",
  agents: PROJECT + "/.claude/agents",
  hooks: PROJECT + "/.claude/hooks",
  settings: PROJECT + "/.claude/settings.json",
  config: PROJECT + "/.claude/orc.config.yaml",
  run_dir: PROJECT + "/.claude/orc/run",
  log_dir: PROJECT + "/.claude/orc/logs",
};

// STALE on purpose (§9: you cannot design the STALE chip while your wiki is fresh).

module.exports = { PROJECT, doctor, where };
