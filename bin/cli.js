#!/usr/bin/env node
"use strict";

/**
 * orc — installer for the ORC Claude Code skill constellation.
 *
 * `orc` is not a runtime. It is a set of markdown skills + slash commands that
 * Claude Code reads. This CLI just copies those files into the right place.
 *
 * Commands:
 *   orc init      copy skills + commands into a target .claude directory
 *   orc update    overwrite existing orc skills/commands with this version's
 *   orc where     print the target paths that would be used
 *   orc --help
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

// Where `orc upgrade` fetches a fresh package from. Override with --from <spec>
// or ORC_INSTALL_SPEC (e.g. a fork, a tarball URL, or "orc" for the npm registry
// once published). Default: the GitHub repo's default branch.
const DEFAULT_INSTALL_SPEC =
  process.env.ORC_INSTALL_SPEC || "github:azure-id/orc";

const PKG_ROOT = path.join(__dirname, "..");
const TEMPLATES = path.join(PKG_ROOT, "templates");
const SRC_SKILLS = path.join(TEMPLATES, "skills");
const SRC_COMMANDS = path.join(TEMPLATES, "commands");
const SRC_AGENTS = path.join(TEMPLATES, "agents");
const SRC_HOOKS = path.join(TEMPLATES, "hooks");

const args = process.argv.slice(2);
const cmd = args[0];

// --- arg parsing (tiny, no deps) ---
function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const val = args[i + 1];
  return val && !val.startsWith("-") ? val : true;
}

function resolveClaudeDir() {
  // --global  → ~/.claude    (available in every project)
  // --dir X   → X/.claude
  // default   → ./.claude    (current project)
  if (flag("--global")) return path.join(os.homedir(), ".claude");
  const dir = flag("--dir");
  if (typeof dir === "string") return path.join(path.resolve(dir), ".claude");
  return path.join(process.cwd(), ".claude");
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function listSkillNames() {
  return fs
    .readdirSync(SRC_SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

// node command string for a hook/statusline script at an absolute path.
// Forward slashes work on every platform node runs on and dodge shell quoting.
function nodeCmd(absPath) {
  return `node "${absPath.replace(/\\/g, "/")}"`;
}

// Install the ORC guard scripts and MERGE their wiring into settings.json.
// Non-destructive: never clobbers an existing statusLine, never duplicates the
// PreToolUse hook, and refuses to touch an unparseable settings file.
function installGuards(claudeDir) {
  if (!fs.existsSync(SRC_HOOKS)) return;
  const hooksDest = path.join(claudeDir, "hooks");
  fs.mkdirSync(hooksDest, { recursive: true });
  for (const file of fs.readdirSync(SRC_HOOKS)) {
    fs.copyFileSync(path.join(SRC_HOOKS, file), path.join(hooksDest, file));
    console.log(`  add   hooks/${file}`);
  }

  const guardCmd = nodeCmd(path.join(hooksDest, "orc-effort-guard.js"));
  const statusCmd = nodeCmd(path.join(hooksDest, "orc-statusline.js"));
  const settingsPath = path.join(claudeDir, "settings.json");

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8") || "{}");
    } catch (_) {
      console.log(
        "\n  ⚠  settings.json exists but is not valid JSON — NOT modifying it."
      );
      console.log("     Add these manually so ORC is guarded:");
      console.log(`       PreToolUse (matcher \"Skill\"): ${guardCmd}`);
      console.log(`       statusLine: ${statusCmd}`);
      return;
    }
  }

  // 1) PreToolUse effort guard — add once, or refresh its path on update.
  settings.hooks = settings.hooks || {};
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
  let guarded = false;
  for (const entry of settings.hooks.PreToolUse) {
    for (const h of entry.hooks || []) {
      if (typeof h.command === "string" && h.command.includes("orc-effort-guard")) {
        h.command = guardCmd; // keep the path current
        guarded = true;
      }
    }
  }
  if (!guarded) {
    settings.hooks.PreToolUse.push({
      matcher: "Skill",
      hooks: [{ type: "command", command: guardCmd }],
    });
    console.log("  add   settings.json → PreToolUse effort guard (hard-block)");
  } else {
    console.log("  upd   settings.json → PreToolUse effort guard path");
  }

  // 2) statusLine model warning — set ONLY if the user has none (never clobber).
  if (!settings.statusLine) {
    settings.statusLine = { type: "command", command: statusCmd };
    console.log("  add   settings.json → statusLine model warning");
  } else if (
    settings.statusLine.command &&
    settings.statusLine.command.includes("orc-statusline")
  ) {
    settings.statusLine.command = statusCmd;
    console.log("  upd   settings.json → statusLine path");
  } else {
    console.log(
      "  skip  settings.json → statusLine (you already have one; to warn on\n" +
        `        non-Opus/high, add: ${statusCmd})`
    );
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

function install({ overwrite }) {
  const claudeDir = resolveClaudeDir();
  const skillsDest = path.join(claudeDir, "skills");
  const commandsDest = path.join(claudeDir, "commands");
  const agentsDest = path.join(claudeDir, "agents");

  fs.mkdirSync(skillsDest, { recursive: true });
  fs.mkdirSync(commandsDest, { recursive: true });
  fs.mkdirSync(agentsDest, { recursive: true });

  const skills = listSkillNames();
  for (const name of skills) {
    const dest = path.join(skillsDest, name);
    if (fs.existsSync(dest) && !overwrite) {
      console.log(`  skip  skills/${name} (exists — use 'orc update' to overwrite)`);
      continue;
    }
    if (fs.existsSync(dest) && overwrite) fs.rmSync(dest, { recursive: true, force: true });
    copyDir(path.join(SRC_SKILLS, name), dest);
    console.log(`  ${overwrite ? "upd " : "add "}  skills/${name}`);
  }

  for (const file of fs.readdirSync(SRC_COMMANDS)) {
    const dest = path.join(commandsDest, file);
    if (fs.existsSync(dest) && !overwrite) {
      console.log(`  skip  commands/${file} (exists)`);
      continue;
    }
    fs.copyFileSync(path.join(SRC_COMMANDS, file), dest);
    console.log(`  ${overwrite ? "upd " : "add "}  commands/${file}`);
  }

  for (const file of fs.readdirSync(SRC_AGENTS)) {
    const dest = path.join(agentsDest, file);
    if (fs.existsSync(dest) && !overwrite) {
      console.log(`  skip  agents/${file} (exists)`);
      continue;
    }
    fs.copyFileSync(path.join(SRC_AGENTS, file), dest);
    console.log(`  ${overwrite ? "upd " : "add "}  agents/${file}`);
  }

  installGuards(claudeDir);

  console.log(`\nInstalled into ${claudeDir}`);
  console.log(
    "Slash commands: /orc  /orc-mini  /orc-analyze  /orc-plan  /orc-verify  /orc-wiki  /orc-config"
  );
  console.log("\nNext:");
  console.log("  • Paste your PR template into skills/orc/subskills/orc-pr/pr.md");
  console.log("  • Add to your .gitignore:  .claude/skills/orc/run/");
  console.log("  • If a /command doesn't appear, your Claude Code may read commands");
  console.log("    from a different folder — move the files in commands/ there.");
  console.log("  • Run /agents to confirm the agent model IDs your CLI accepts,");
  console.log("    and run your MAIN session on Opus (see agents/MODEL-MAPPING.md).");
  console.log("  • A PreToolUse guard now HARD-BLOCKS /orc unless the session is at");
  console.log("    high effort; the statusline warns when the model isn't Opus 4.8.");
}

// Reconstruct the target flags (--global / --dir X) to pass through to the
// fresh `orc update` process, so upgrade lands in the same place the user asked.
function targetFlags() {
  if (flag("--global")) return ["--global"];
  const dir = flag("--dir");
  if (typeof dir === "string") return ["--dir", dir];
  return [];
}

// Universal fallback: a plain tarball of the default branch. This dodges the
// `npm i -g <github-spec>` path that can fail under NVM / restricted git (the
// github: spec shells out to git; the tarball is a straight HTTPS download).
const TARBALL_SPEC =
  "https://github.com/azure-id/orc/archive/refs/heads/main.tar.gz";

// Try `npm install -g <spec>`; return true on success. Inherits stdio so the
// user sees npm's own output.
function npmInstallGlobal(spec) {
  console.log("  → npm install -g " + spec);
  const r = spawnSync(`npm install -g ${spec}`, { stdio: "inherit", shell: true });
  return r.status === 0;
}

// Resolve the freshly-installed cli.js via `npm root -g`, so step 2 runs the NEW
// code regardless of how PATH resolves `orc` (important under NVM, where the
// running shim and the global prefix can differ). Falls back to null if the path
// can't be determined — the caller then spawns `orc` by name.
function freshCliPath() {
  const r = spawnSync("npm root -g", { shell: true, encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return null;
  const p = path.join(r.stdout.trim(), "orc", "bin", "cli.js");
  return fs.existsSync(p) ? p : null;
}

// `orc upgrade` = fetch the latest package from the source, THEN apply it.
// Two steps because `orc update` alone only re-copies whatever is already
// installed — it never reaches the network. Step 1 refreshes the global package
// (this is the part that pulls from GitHub/npm); step 2 runs the FRESH cli so the
// newly-installed version does the copy (the running process still holds the OLD
// templates). User overrides in .claude/orc.config.yaml are untouched — update
// never writes there.
function upgrade() {
  const fromFlag = typeof flag("--from") === "string" ? flag("--from") : null;
  // Specs to try in order. When the user didn't pin --from, fall back from the
  // default github: spec to the plain tarball (the NVM/git bypass).
  const specs = fromFlag
    ? [fromFlag]
    : [...new Set([DEFAULT_INSTALL_SPEC, TARBALL_SPEC])];

  console.log("\norc upgrade — fetching the latest package, then applying it.");
  console.log("  step 1/2: refresh the global orc package");

  let installed = false;
  for (let i = 0; i < specs.length; i++) {
    if (npmInstallGlobal(specs[i])) {
      installed = true;
      break;
    }
    if (i < specs.length - 1) {
      console.log(`\n  ⚠  that source failed — trying a fallback…`);
    }
  }
  if (!installed) {
    const tflags = targetFlags();
    console.error(
      "\n❌ upgrade failed at step 1 (npm install). Nothing was changed in .claude/.\n" +
        "   Try the tarball bypass directly, then apply:\n" +
        `     npm i -g ${TARBALL_SPEC}\n` +
        "     orc update" +
        (tflags.length ? " " + tflags.join(" ") : "") +
        "\n"
    );
    process.exit(1);
  }

  const tflags = targetFlags();
  console.log(
    "\n  step 2/2: apply it — orc update" +
      (tflags.length ? " " + tflags.join(" ") : "")
  );
  // Prefer the resolved fresh cli path; else spawn `orc` by name.
  const cli = freshCliPath();
  const applyCmd = cli
    ? ["node", `"${cli}"`, "update", ...tflags].join(" ")
    : ["orc", "update", ...tflags].join(" ");
  const upd = spawnSync(applyCmd, { stdio: "inherit", shell: true });
  if (upd.status !== 0) {
    console.error(
      "\n⚠  Package upgraded, but applying it (orc update) failed. Re-run:\n" +
        "     orc update" +
        (tflags.length ? " " + tflags.join(" ") : "") +
        "\n"
    );
    process.exit(upd.status || 1);
  }
  console.log("\n✅ orc upgraded to the latest and applied.");
}

function where() {
  const claudeDir = resolveClaudeDir();
  console.log("skills   →", path.join(claudeDir, "skills"));
  console.log("commands →", path.join(claudeDir, "commands"));
  console.log("agents   →", path.join(claudeDir, "agents"));
  console.log("hooks    →", path.join(claudeDir, "hooks"));
  console.log("settings →", path.join(claudeDir, "settings.json"), "(merged)");
  console.log(
    "config   →",
    path.join(claudeDir, "orc.config.yaml"),
    "(user overrides via /orc-config; update-safe)"
  );
}

function help() {
  console.log(`orc — install the ORC Claude Code skill constellation

Usage:
  orc init [--global | --dir <path>]      copy skills + commands (skips existing)
  orc update [--global | --dir <path>]    overwrite existing orc files (local copy only)
  orc upgrade [--global | --dir <path>]   fetch the LATEST package, then apply it
                                          [--from <spec>]  (default: ${DEFAULT_INSTALL_SPEC})
  orc where [--global | --dir <path>]     show target paths
  orc --help

Targets:
  (default)      ./.claude            current project
  --global       ~/.claude            all projects
  --dir <path>   <path>/.claude       a specific project

update vs upgrade:
  update   re-copies the templates already installed in this package (offline).
  upgrade  refreshes the package from the source first (network), THEN copies —
           this is what actually pulls a new version. Your .claude/orc.config.yaml
           overrides survive either way.

Skills installed: ${listSkillNames().join(", ")}`);
}

switch (cmd) {
  case "init":
    install({ overwrite: false });
    break;
  case "update":
    install({ overwrite: true });
    break;
  case "upgrade":
    upgrade();
    break;
  case "where":
    where();
    break;
  case "--help":
  case "-h":
  case "help":
  case undefined:
    help();
    break;
  default:
    console.error(`Unknown command: ${cmd}\n`);
    help();
    process.exit(1);
}
