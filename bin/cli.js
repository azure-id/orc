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

// Positional args with flags (and their values) stripped out, so
// `orc config --global set max_scouts 5` and `orc config set max_scouts 5 --global`
// both yield ["config","set","max_scouts","5"].
function positionals() {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--global") continue;
    if (a === "--dir" || a === "--from" || a === "--preset") {
      i++; // skip the flag's value
      continue;
    }
    if (a.startsWith("-")) continue;
    out.push(a);
  }
  return out;
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
  // Stamp the installed payload version so the hooks can nudge when a newer orc
  // is available (compared against the cached latest). Regenerated every install.
  try {
    fs.writeFileSync(
      path.join(hooksDest, "orc-version.json"),
      JSON.stringify({ version: currentVersion() }) + "\n"
    );
  } catch (_) {}

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

  // 3) Trace hook — PreToolUse(Task|Agent) SPAWN + SubagentStop RETURN
  //    skeleton. Idempotent; non-destructive. Behavior-trace logging is
  //    PERMANENT (always on); the hook bootstraps log_dir + the run pointer
  //    itself, so wiring it is always safe and a trace is guaranteed for every
  //    ORC run. The matcher MUST cover both tool names — newer Claude Code
  //    dispatches subagents via `Agent`, older via `Task`; a Task-only matcher
  //    silently stops SPAWN lines (and run-file rotation) forever.
  const traceCmd = nodeCmd(path.join(hooksDest, "orc-trace.js"));
  const wireTrace = (arrName, matcher) => {
    settings.hooks[arrName] = settings.hooks[arrName] || [];
    let found = false;
    for (const entry of settings.hooks[arrName]) {
      for (const h of entry.hooks || []) {
        if (typeof h.command === "string" && h.command.includes("orc-trace")) {
          h.command = traceCmd; // keep the path current on update
          // Repair a stale matcher too (pre-v0.23.0 installs wired "Task").
          if (matcher) entry.matcher = matcher;
          found = true;
        }
      }
    }
    if (!found) {
      const entry = { hooks: [{ type: "command", command: traceCmd }] };
      if (matcher) entry.matcher = matcher;
      settings.hooks[arrName].push(entry);
      console.log(`  add   settings.json → ${arrName} trace hook`);
    } else {
      console.log(`  upd   settings.json → ${arrName} trace hook path+matcher`);
    }
  };
  wireTrace("PreToolUse", "Task|Agent");
  wireTrace("SubagentStop", null);

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

  // A compiled orc-diy flow is version-stamped — installing a different orc
  // makes it stale. Nudge here so the user recompiles before the gate bites.
  try {
    const diyLock = readDiyLock(claudeDir);
    if (diyLock && diyLock.compiled_hash && diyLock.orc_version !== currentVersion()) {
      console.log("\n  ⚠  your orc-diy compiled flow is now STALE (orc changed) — run `orc diy compile`.");
    }
  } catch (_) {}

  console.log(`\nInstalled into ${claudeDir}`);
  // Derive the command list from what actually shipped so it never drifts from
  // templates/commands/. /orc leads; the rest follow in sorted order.
  let slashList;
  try {
    const cmds = fs
      .readdirSync(SRC_COMMANDS)
      .filter((f) => f.endsWith(".md"))
      .map((f) => "/" + f.replace(/\.md$/, ""))
      .sort((a, b) => (a === "/orc" ? -1 : b === "/orc" ? 1 : a.localeCompare(b)));
    slashList = cmds.join("  ");
  } catch (_) {
    slashList = "/orc";
  }
  console.log("Slash commands: " + slashList);
  console.log("Config: run `orc config` (CLI, interactive) — not a slash command.");
  console.log("Custom flow: /orc-diy stays gated until you run `orc diy init` + `orc diy compile`.");
  console.log("Cross-repo: `orc crosslink` links sibling repos' wikis (advisory; orc-wiki resolves the rest).");
  console.log("\nNext:");
  console.log("  • Paste your PR template into skills/orc/subskills/orc-pr/pr.md");
  console.log("  • Add to your .gitignore:  .claude/skills/orc/run/");
  console.log("  • If a /command doesn't appear, your Claude Code may read commands");
  console.log("    from a different folder — move the files in commands/ there.");
  console.log("  • Run /agents to confirm the agent model IDs your CLI accepts,");
  console.log("    and run your MAIN session on Opus (see agents/MODEL-MAPPING.md).");
  console.log("  • A PreToolUse guard now HARD-BLOCKS /orc unless the session is at");
  console.log("    high effort; the statusline warns when the model isn't Opus 4.8.");
  console.log("  • Behavior-trace logging is ALWAYS ON (permanent) — every ORC run");
  console.log("    writes a persistent trace under .claude/orc/logs/ (set log_dir to move it).");
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
        "     orc update. But if still fails copy this then run manually in terminal: \n" + 
        "     npm i -g https://github.com/azure-id/orc/archive/refs/heads/main.tar.gz" +
        (tflags.length ? " " + tflags.join(" ") : "") +
        "\n",
    );
    process.exit(upd.status || 1);
  }
  console.log("\n✅ orc upgraded to the latest and applied.");
}

// ---------------------------------------------------------------------------
// orc config — deterministic, zero-token config editing (no model in the loop).
// Reads/writes the update-safe override .claude/orc.config.yaml. config.md stays
// the shipped defaults + documentation; the defaults below MIRROR it — keep them
// in sync when config.md's defaults change (a documented drift, like the agents).
// ---------------------------------------------------------------------------

const KNOWN_MODELS = [
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
];

const vInt = (min) => (raw) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) return { err: `must be an integer >= ${min}` };
  return { value: n };
};
const vRange = (min, max) => (raw) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max)
    return { err: `must be an integer ${min}-${max}` };
  return { value: n };
};
const vEnum = (...opts) => (raw) =>
  opts.includes(raw) ? { value: raw } : { err: `must be one of: ${opts.join(", ")}` };
const vModel = (raw) => {
  if (!KNOWN_MODELS.includes(raw))
    return { err: `unknown model id (expected one of: ${KNOWN_MODELS.join(", ")})` };
  const warn = raw.startsWith("claude-opus")
    ? null
    : "⚠ below Opus — every opus-* agent silently falls back to Sonnet (model-tier ladder).";
  return { value: raw, warn };
};
const vPath = (raw) =>
  raw && raw.trim() ? { value: raw } : { err: "must be a non-empty path" };

// Ordered, tiered metadata. Common first, then advanced.
// `options` (common tier only) is the pick-list shown in the interactive menu —
// a friendly enum. Typed values are still allowed and re-checked by `validate`,
// so the list guides without locking power users out.
const CONFIG_META = [
  { key: "max_wave_tasks", def: 3, tier: "common", validate: vInt(1), options: [2, 3, 4, 5], desc: "Max parallel tasks per execution wave (higher = more parallelism, more collision risk)." },
  { key: "batch_pause_every", def: 2, tier: "common", validate: vInt(1), options: [1, 2, 3, 4, 5], desc: "Waves between stop-and-continue pauses (1 = pause every wave)." },
  { key: "rubric_bands", def: 5, tier: "common", validate: vRange(2, 8), options: [2, 3, 4, 5, 6, 7, 8], desc: "Scoring granularity (2-5 narrow preset, 6-8 wide preset)." },
  { key: "max_scouts", def: 3, tier: "common", validate: vInt(1), options: [1, 2, 3, 4, 5], desc: "Max parallel code scouts fanned out in deep analysis." },
  { key: "default_analysis_depth", def: "standard", tier: "common", validate: vEnum("standard", "deep"), options: ["standard", "deep"], desc: "Analyst depth gate default — deep = wider sweep + scouts (run still confirms)." },
  { key: "generate_tests", def: false, tier: "common", validate: vEnum("true", "false"), options: ["true", "false"], desc: "Opt-in Phase 6.5: author test cases before ship (writes tests, never runs them). OFF by default." },
  { key: "pattern_findings", def: "ask", tier: "common", validate: vEnum("ask", "on", "off"), options: ["ask", "on", "off"], desc: "Code-pattern gate on an FE/BE cache miss: ask = prompt, on = auto-codify, off = always agnostic." },
  { key: "security_review", def: "off", tier: "common", validate: vEnum("off", "ask", "on"), options: ["off", "ask", "on"], desc: "Opt-in Phase 5.5 security pass on runs with a task scored >= 70 (risk floor). OFF by default." },
  // NOTE: behavior-trace logging is PERMANENT (always on) and intentionally NOT
  // a config key — the orc-trace.js hook always writes a persistent trace per
  // run under log_dir. Only the folder location (log_dir) is configurable.
  { key: "orc_wiki_pattern_findings", def: false, tier: "advanced", validate: vEnum("true", "false"), desc: "orc-wiki also codifies ALL detected languages during its scan (pre-warms the pattern cache)." },
  { key: "crosslink_fresh_days", def: 10, tier: "advanced", validate: vInt(1), desc: "Cross-repo crosslink snapshot: days since sync ≤ this → FRESH hint (Signal B; advisory)." },
  { key: "crosslink_aging_days", def: 15, tier: "advanced", validate: vInt(1), desc: "Cross-repo crosslink snapshot: days since sync ≤ this → AGING; beyond → STALE (advisory, never blocks)." },
  { key: "log_dir", def: ".claude/orc/logs", tier: "advanced", validate: vPath, desc: "Persistent trace folder (never auto-deleted)." },
  { key: "analyzer_dir", def: ".claude/skills/orc/analyzer", tier: "advanced", validate: vPath, desc: "Internal analyst artifact dir." },
  { key: "planner_dir", def: ".claude/skills/orc/planner", tier: "advanced", validate: vPath, desc: "Internal planner artifact dir." },
  { key: "report_out_dir", def: "analyst_report", tier: "advanced", validate: vPath, desc: "Project-root copy target on report-only." },
  { key: "orchestrator_model", def: "claude-opus-4-8", tier: "advanced", validate: vModel, desc: "Main-session model (below Opus breaks the tier ladder)." },
];
const metaFor = (key) => CONFIG_META.find((m) => m.key === key);
const overridePath = (claudeDir) => path.join(claudeDir, "orc.config.yaml");

// Minimal flat `key: value` reader. Preserves unknown keys (e.g. an advanced
// rubric_bands_override the user hand-edited) verbatim.
function readOverride(claudeDir) {
  const p = overridePath(claudeDir);
  const map = {};
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf(":");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      map[k] = v;
    }
  }
  return { path: p, map };
}

function serializeValue(value) {
  if (typeof value === "number") return String(value);
  const s = String(value);
  if (s === "true" || s === "false") return s;
  if (s.startsWith("[") || s.startsWith("{")) return s; // flow (JSON) — valid YAML
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

function writeOverride(claudeDir, map) {
  const p = overridePath(claudeDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const keys = Object.keys(map);
  let out =
    "# .claude/orc.config.yaml — ORC user overrides (managed by `orc config`).\n" +
    "# Only changed keys appear here. Effective value = config.md default, then this.\n" +
    "# `orc update` / `orc upgrade` never touch this file.\n";
  if (!keys.length) out += "# (no overrides set)\n";
  for (const k of keys) out += `${k}: ${serializeValue(map[k])}\n`;
  fs.writeFileSync(p, out);
  return p;
}

function configList(claudeDir) {
  const { path: p, map } = readOverride(claudeDir);
  console.log(
    `\nORC config  (override: ${p}${fs.existsSync(p) ? "" : "  — not created yet"})\n`
  );
  const pad = Math.max(...CONFIG_META.map((m) => m.key.length));
  for (const tier of ["common", "advanced"]) {
    console.log(tier === "common" ? "Common" : "\nAdvanced");
    for (const m of CONFIG_META.filter((x) => x.tier === tier)) {
      const has = Object.prototype.hasOwnProperty.call(map, m.key);
      const val = has ? map[m.key] : m.def;
      const src = has ? "overridden" : "default   ";
      const opts = m.options ? ` [options: ${m.options.join(" | ")}]` : "";
      console.log(`  ${m.key.padEnd(pad)}  ${String(val).padEnd(30)} ${src}  ${m.desc}${opts}`);
    }
  }
  const extra = Object.keys(map).filter((k) => !metaFor(k));
  if (extra.length) {
    console.log("\nOther (hand-edited) overrides");
    for (const k of extra) console.log(`  ${k}: ${map[k]}`);
  }
  console.log("");
}

function configSet(claudeDir, key, rawValue) {
  const m = metaFor(key);
  if (!m) {
    console.error(
      `Unknown config key: ${key}\nKnown keys: ${CONFIG_META.map((x) => x.key).join(", ")}` +
        "\n(rubric_bands_override is advanced — hand-edit orc.config.yaml.)"
    );
    process.exit(1);
  }
  if (rawValue === undefined) {
    console.error(`Usage: orc config set ${key} <value>`);
    process.exit(1);
  }
  const res = m.validate(rawValue);
  if (res.err) {
    console.error(`Invalid value for ${key}: ${res.err}`);
    process.exit(1);
  }
  if (res.warn) console.error(`  ${res.warn}`);
  const { map } = readOverride(claudeDir);
  map[key] = res.value;
  const p = writeOverride(claudeDir, map);
  console.log(`Set ${key} = ${res.value}  →  ${p}`);
}

function configReset(claudeDir, key) {
  const { map } = readOverride(claudeDir);
  if (!key) {
    const p = writeOverride(claudeDir, {});
    console.log(`Cleared all overrides  →  ${p}  (everything reverts to defaults)`);
    return;
  }
  if (!(key in map)) {
    console.log(`${key} has no override — already at default.`);
    return;
  }
  delete map[key];
  const p = writeOverride(claudeDir, map);
  const m = metaFor(key);
  console.log(`Reset ${key}${m ? ` → default (${m.def})` : ""}.  ${p}`);
}

// Interactive menu — humans only. If stdin isn't a TTY (e.g. Claude's Bash tool),
// don't hang: print the table + a hint to use `set`.
function configInteractive(claudeDir) {
  if (!process.stdin.isTTY) {
    console.log("(non-interactive shell — showing config; use `orc config set <key> <value>` to change)");
    configList(claudeDir);
    return;
  }
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  (async () => {
    for (;;) {
      const { map } = readOverride(claudeDir);
      console.log("\nORC config — pick a setting to change:\n");
      const pad = Math.max(...CONFIG_META.map((m) => m.key.length));
      CONFIG_META.forEach((m, i) => {
        const has = Object.prototype.hasOwnProperty.call(map, m.key);
        const val = has ? map[m.key] : m.def;
        const tag = has ? "overridden" : "default";
        const adv = m.tier === "advanced" ? " (adv)" : "";
        console.log(
          `  ${String(i + 1).padStart(2)}) ${m.key.padEnd(pad)}  ${String(val).padEnd(28)} ${tag}${adv}`
        );
      });
      console.log("   r) reset a key     q) quit");
      const choice = (await ask("\n> ")).trim().toLowerCase();
      if (choice === "" || choice === "q") break;
      if (choice === "r") {
        const k = (await ask("reset which key (blank = all): ")).trim();
        configReset(claudeDir, k || undefined);
        continue;
      }
      const m = CONFIG_META[Number(choice) - 1];
      if (!m) {
        console.log("  ? not a valid choice");
        continue;
      }
      console.log(`\n${m.key} — ${m.desc}`);
      const { map: cur } = readOverride(claudeDir);
      const has = Object.prototype.hasOwnProperty.call(cur, m.key);
      console.log(`  current: ${has ? cur[m.key] : m.def}   default: ${m.def}`);
      // Common keys carry an `options` list (a friendly enum). String enums
      // get a numbered pick-list (type the number OR the value); numeric
      // options stay type-the-value — a digit would be ambiguous as an index.
      // A raw value outside the list is still accepted if `validate` passes.
      const numericOpts = m.options && m.options.every((o) => typeof o === "number");
      let prompt = "  new value (blank = keep): ";
      if (m.options && !numericOpts) {
        m.options.forEach((o, i) => console.log(`    ${i + 1}) ${o}`));
        prompt = "  pick a number or type a value (blank = keep): ";
      } else if (m.options) {
        console.log(`  options: ${m.options.join(" | ")}`);
        prompt = "  type a value (blank = keep): ";
      }
      const nv = (await ask(prompt)).trim();
      if (!nv) {
        console.log("  (unchanged)");
        continue;
      }
      let picked = nv;
      if (m.options && !numericOpts && /^\d+$/.test(nv) && m.options[Number(nv) - 1] !== undefined)
        picked = String(m.options[Number(nv) - 1]);
      const res = m.validate(picked);
      if (res.err) {
        console.log(`  invalid: ${res.err}`);
        continue;
      }
      if (res.warn) console.log(`  ${res.warn}`);
      cur[m.key] = res.value;
      writeOverride(claudeDir, cur);
      console.log(`  ✓ ${m.key} = ${res.value}`);
    }
    rl.close();
    console.log("done.");
  })();
}

function config() {
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["config", <sub?>, <key?>, <value?>]
  const sub = pos[1];
  switch (sub) {
    case undefined:
      configInteractive(claudeDir);
      break;
    case "list":
    case "get":
      configList(claudeDir);
      break;
    case "path":
      console.log(overridePath(claudeDir));
      break;
    case "set":
      configSet(claudeDir, pos[2], pos[3]);
      break;
    case "reset":
      configReset(claudeDir, pos[2]);
      break;
    default:
      console.error(
        `Unknown: orc config ${sub}\n` +
          "Usage: orc config [list | set <key> <value> | reset [key] | path]\n" +
          "       orc config            (interactive menu)"
      );
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// orc diy — user-composable flow. The CLI is the ONLY writer of the config
// (.claude/orc-diy.config.yaml), the flow spec (.claude/orc/diy/flow.md), the
// lock (.claude/orc/diy/flow.lock.json) and the compiled artifact
// (.claude/orc/diy/FLOW-COMPILED.md). The orc-diy skill only gates + dispatches.
// Project-scoped only: --global is rejected for the whole family.
// ---------------------------------------------------------------------------

const crypto = require("crypto");
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Executor catalog with tier ranks (model rank, effort rank). Subagents cannot
// exceed the main-session tier — validation + score-table clipping use this.
const DIY_EXECUTORS = {
  "orc-executor-sonnet-4-6-med": { model: 1, effort: 1 },
  "orc-executor-sonnet-4-6-high": { model: 1, effort: 2 },
  "orc-executor-sonnet-5-high": { model: 2, effort: 2 },
  "orc-executor-opus-4-7-med": { model: 3, effort: 1 },
  "orc-executor-opus-4-7-high": { model: 3, effort: 2 },
  "orc-executor-opus-4-8-high": { model: 4, effort: 2 },
};
const DIY_TIERS = {
  "sonnet-4-6-high": { model: 1, effort: 2, modelId: "claude-sonnet-4-6", effortName: "high" },
  "opus-4-7-med": { model: 3, effort: 1, modelId: "claude-opus-4-7", effortName: "medium" },
  "opus-4-8-high": { model: 4, effort: 2, modelId: "claude-opus-4-8", effortName: "high" },
};
// allowed under a tier: lower model always; same model only at <= effort.
const agentFitsTier = (a, t) =>
  a.model < t.model || (a.model === t.model && a.effort <= t.effort);

const vSlug = (raw) =>
  /^[a-z0-9][a-z0-9-]*$/.test(raw)
    ? { value: raw }
    : { err: "must be a lowercase slug (a-z, 0-9, dashes)" };

const DIY_META = [
  { key: "analyze", def: "auto", options: ["auto", "off", "mini", "full"], validate: vEnum("auto", "off", "mini", "full"), desc: "Doc-intake analyst: auto (full-lane routing) | off | mini | full." },
  { key: "planning", def: "auto", options: ["auto", "own-planner", "superpowers", "openspec"], validate: vEnum("auto", "own-planner", "superpowers", "openspec"), desc: "Planning route." },
  { key: "pattern", def: "ask", options: ["ask", "off", "on"], validate: vEnum("ask", "off", "on"), desc: "Code-pattern gate on a cache miss: ask | off | on." },
  { key: "scoring", def: "on", options: ["on", "off"], validate: vEnum("on", "off"), desc: "Rubric scoring; off sends every task to fixed_executor." },
  { key: "fixed_executor", def: "", options: Object.keys(DIY_EXECUTORS), validate: vEnum(...Object.keys(DIY_EXECUTORS)), desc: "Executor used for every task when scoring is off." },
  { key: "review", def: "on", options: ["on", "off", "blocking-only"], validate: vEnum("on", "off", "blocking-only"), desc: "Review phase: on | off | blocking-only (P2/P3 listed once, never re-offered)." },
  { key: "security", def: "off", options: ["off", "ask", "on", "always"], validate: vEnum("off", "ask", "on", "always"), desc: "Security pass; always = every run (drops the risk-floor trigger)." },
  { key: "verify", def: "full", options: ["full", "off", "smoke"], validate: vEnum("full", "off", "smoke"), desc: "Verify depth: full DoD sweep | off | smoke (build+tests only)." },
  { key: "testgen", def: "off", options: ["off", "ask", "on"], validate: vEnum("off", "ask", "on"), desc: "Test-authoring phase (writes tests, never runs them)." },
  { key: "wiki_gate", def: "notice", options: ["notice", "off", "hard"], validate: vEnum("notice", "off", "hard"), desc: "Wiki freshness at preflight: notice | off | hard (stale blocks with an ask)." },
  { key: "post_ship_wiki_ask", def: "on", options: ["on", "off"], validate: vEnum("on", "off"), desc: "Offer a wiki refresh after big shipped runs." },
  { key: "summary", def: "full", options: ["full", "off", "short"], validate: vEnum("full", "off", "short"), desc: "Summary depth." },
  { key: "autonomy", def: "interactive", options: ["interactive", "semi", "hands-off"], validate: vEnum("interactive", "semi", "hands-off"), desc: "Who answers routine asks: interactive | semi | hands-off." },
  { key: "ship_mode", def: "ask", options: ["ask", "commit", "pr", "report-only"], validate: vEnum("ask", "commit", "pr", "report-only"), desc: "Terminal ship behavior." },
  { key: "session_tier", def: "opus-4-8-high", options: Object.keys(DIY_TIERS), validate: vEnum(...Object.keys(DIY_TIERS)), desc: "Required main-session model+effort (guard-enforced effort, statusline-warned model)." },
  { key: "max_wave_tasks", def: 3, options: [2, 3, 4, 5], validate: vInt(1), desc: "Max parallel tasks per wave." },
  { key: "batch_pause_every", def: 2, options: [1, 2, 3, 4, 5], validate: vInt(1), desc: "Waves between stop-and-continue pauses." },
  { key: "rubric_bands", def: 5, options: [2, 3, 4, 5, 6, 7, 8], validate: vRange(2, 8), desc: "Scoring granularity (scoring on only)." },
  { key: "flow_name", def: "my-flow", validate: vSlug, desc: "Display label for this flow (slug)." },
];
const diyMetaFor = (key) => DIY_META.find((m) => m.key === key);

const DIY_PRESETS = {
  lean: { analyze: "off", review: "blocking-only", verify: "smoke", summary: "short", flow_name: "lean" },
  paranoid: { analyze: "full", security: "always", testgen: "on", verify: "full", flow_name: "paranoid" },
  "solo-fast": { scoring: "off", fixed_executor: "orc-executor-sonnet-5-high", review: "off", verify: "smoke", autonomy: "semi", flow_name: "solo-fast" },
};

function diyPaths(claudeDir) {
  const dir = path.join(claudeDir, "orc", "diy");
  return {
    config: path.join(claudeDir, "orc-diy.config.yaml"),
    dir,
    flow: path.join(dir, "flow.md"),
    lock: path.join(dir, "flow.lock.json"),
    compiled: path.join(dir, "FLOW-COMPILED.md"),
  };
}

// Flat `key: value` YAML, same dialect as orc.config.yaml.
function readDiyConfig(claudeDir) {
  const p = diyPaths(claudeDir).config;
  if (!fs.existsSync(p)) return null;
  const map = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf(":");
    if (i === -1) continue;
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return Object.keys(map).length ? map : null;
}

// Resolved view: defaults <- stored keys (per-key, like orc.config.yaml).
function diyResolve(map) {
  const out = {};
  for (const m of DIY_META) out[m.key] = map && m.key in map ? map[m.key] : m.def;
  return out;
}

function diyValidate(cfg) {
  const errors = [];
  const warnings = [];
  const tier = DIY_TIERS[cfg.session_tier];
  if (!tier) errors.push(`session_tier "${cfg.session_tier}" is not a known tier`);
  if (cfg.scoring === "off") {
    if (!cfg.fixed_executor) {
      errors.push("scoring is off but fixed_executor is not set (required — every task needs an executor)");
    } else if (tier && !agentFitsTier(DIY_EXECUTORS[cfg.fixed_executor], tier)) {
      errors.push(`fixed_executor ${cfg.fixed_executor} exceeds session_tier ${cfg.session_tier} (subagents cannot exceed the main session)`);
    }
    if (String(cfg.rubric_bands) !== "5") warnings.push("rubric_bands is set but scoring is off — it will be ignored");
  }
  if (cfg.review === "off" && cfg.security !== "off") {
    errors.push("security pass requires review on (it reuses the reviewer) — set review on/blocking-only or security off");
  }
  if (cfg.testgen !== "off" && cfg.verify === "off") {
    warnings.push("testgen without verify: test cases will be authored against an unverified build");
  }
  if (cfg.autonomy === "hands-off" && (cfg.ship_mode === "commit" || cfg.ship_mode === "pr")) {
    warnings.push(`hands-off + ship_mode ${cfg.ship_mode}: git actions will run fully unattended`);
  }
  if (tier && tier.model < 4 && (cfg.review !== "off" || cfg.verify !== "off")) {
    warnings.push(`session_tier ${cfg.session_tier}: the pinned Opus reviewer/verifier agents will silently run at the session's model (tier-honesty rule reports it)`);
  }
  return { errors, warnings };
}

// Score->model presets (mirror skills/orc/config.md — documented drift).
const DIY_PRESET_NARROW = [
  [0, 30, "orc-executor-sonnet-4-6-med"],
  [30, 50, "orc-executor-sonnet-4-6-high"],
  [50, 65, "orc-executor-sonnet-5-high"],
  [65, 85, "orc-executor-opus-4-7-med"],
  [85, 101, "orc-executor-opus-4-8-high"],
];
const DIY_PRESET_WIDE = [
  [0, 40, "orc-executor-sonnet-4-6-med"],
  [40, 50, "orc-executor-sonnet-4-6-high"],
  [50, 70, "orc-executor-sonnet-5-high"],
  [70, 80, "orc-executor-opus-4-7-high"],
  [80, 101, "orc-executor-opus-4-8-high"],
];

// Clip a preset to the session tier: an over-tier agent collapses into the
// highest executor the tier allows. Done at COMPILE time, never at runtime.
function diyScoreTable(cfg) {
  const tier = DIY_TIERS[cfg.session_tier];
  const rows = Number(cfg.rubric_bands) >= 6 ? DIY_PRESET_WIDE : DIY_PRESET_NARROW;
  const highestAllowed = Object.keys(DIY_EXECUTORS)
    .filter((a) => agentFitsTier(DIY_EXECUTORS[a], tier))
    .sort((a, b) => DIY_EXECUTORS[a].model - DIY_EXECUTORS[b].model || DIY_EXECUTORS[a].effort - DIY_EXECUTORS[b].effort)
    .pop();
  const lines = ["| Score | Executor agent |", "|-------|----------------|"];
  for (const [lo, hi, agent] of rows) {
    const use = agentFitsTier(DIY_EXECUTORS[agent], tier) ? agent : highestAllowed;
    lines.push(`| [${lo},${hi === 101 ? "100]" : hi + ")"} | ${use} |`);
  }
  return lines.join("\n");
}

function diyGenFlowMd(cfg) {
  const lines = [
    `# ORC-DIY flow spec — ${cfg.flow_name}`,
    "",
    "> Generated by `orc diy` from `.claude/orc-diy.config.yaml` — review it,",
    "> change it with `orc diy set <key> <value>`, then `orc diy compile`.",
    "",
    "| Key | Value |",
    "|---|---|",
  ];
  for (const m of DIY_META) lines.push(`| ${m.key} | ${cfg[m.key] === "" ? "(unset)" : cfg[m.key]} |`);
  lines.push(
    "",
    "Phase order (fixed): wiki gate → analyze → planning → pattern → scoring →",
    "execution → review → security → verify → testgen → ship → summary.",
    "Locked rules (skills/orc-diy/references/locked-blocks.md) apply to every flow.",
    ""
  );
  return lines.join("\n");
}

function readDiyLock(claudeDir) {
  try {
    // strip a BOM — Windows tools that touch the file often add one
    return JSON.parse(
      fs.readFileSync(diyPaths(claudeDir).lock, "utf8").replace(/^\uFEFF/, "")
    );
  } catch (_) {
    return null;
  }
}

// Installed payload version: the stamp `orc init/update` writes next to hooks.
function installedPayloadVersion(claudeDir) {
  try {
    const v = JSON.parse(
      fs.readFileSync(path.join(claudeDir, "hooks", "orc-version.json"), "utf8")
    ).version;
    if (v) return v;
  } catch (_) {}
  return currentVersion();
}

// Regenerate flow.md + refresh the lock's config/flow hashes. Compiled fields
// are preserved as-is — a hash mismatch is exactly how status reports STALE.
function diyWriteConfig(claudeDir, map) {
  const p = diyPaths(claudeDir);
  fs.mkdirSync(p.dir, { recursive: true });
  // Always persist flow_name: a bootstrapped config must never be key-empty
  // (an empty/comment-only file reads as UNCONFIGURED — the hard gate).
  if (!map.flow_name) map.flow_name = diyMetaFor("flow_name").def;
  let out =
    "# .claude/orc-diy.config.yaml — ORC-DIY flow config (managed by `orc diy`).\n" +
    "# Never hand-edit: the compile gate hashes this file. Change via `orc diy set`.\n";
  for (const k of Object.keys(map)) out += `${k}: ${serializeValue(map[k])}\n`;
  fs.writeFileSync(p.config, out);
  const cfg = diyResolve(map);
  const flowMd = diyGenFlowMd(cfg);
  fs.writeFileSync(p.flow, flowMd);
  const lock = readDiyLock(claudeDir) || {};
  const next = {
    flow_name: cfg.flow_name,
    session_tier: cfg.session_tier,
    // config_hash is COMPILE-owned: it stays at the compile-time value so a
    // config change (this very write) reads as STALE until the next compile.
    config_hash: lock.config_hash || null,
    flow_hash: sha256(flowMd),
    compiled_hash: lock.compiled_hash || null,
    compiled_at: lock.compiled_at || null,
    orc_version: lock.orc_version || null,
  };
  fs.writeFileSync(p.lock, JSON.stringify(next, null, 2) + "\n");
  return cfg;
}

// Gate status. Consumed by `orc diy status`, the orc-diy stub skill, the
// effort guard, and the statusline — one computation, everywhere the same.
function diyStatus(claudeDir) {
  const p = diyPaths(claudeDir);
  if (!fs.existsSync(p.config) || !readDiyConfig(claudeDir))
    return { state: "UNCONFIGURED", reason: "no flow config — run `orc diy init`" };
  const lock = readDiyLock(claudeDir);
  if (!lock) return { state: "STALE", reason: "lock missing — run `orc diy init` again, then `orc diy compile`" };
  if (!lock.compiled_hash) return { state: "STALE", reason: "never compiled — run `orc diy compile`" };
  if (lock.config_hash !== sha256(fs.readFileSync(p.config, "utf8")))
    return { state: "STALE", reason: "config changed since the last compile — run `orc diy compile`" };
  if (lock.orc_version !== installedPayloadVersion(claudeDir))
    return { state: "STALE", reason: `compiled against orc ${lock.orc_version}, installed is ${installedPayloadVersion(claudeDir)} — run \`orc diy compile\`` };
  if (!fs.existsSync(p.compiled) || sha256(fs.readFileSync(p.compiled, "utf8")) !== lock.compiled_hash)
    return { state: "STALE", reason: "compiled flow modified or missing — run `orc diy compile`" };
  return { state: "READY", reason: `flow "${lock.flow_name}" compiled for ${lock.session_tier}` };
}

// Block templates: prefer the INSTALLED stub (matches the payload version the
// lock stamps), fall back to this package's templates.
function diyBlocksDir(claudeDir) {
  const installed = path.join(claudeDir, "skills", "orc-diy", "references");
  return fs.existsSync(path.join(installed, "blocks")) ? installed : path.join(SRC_SKILLS, "orc-diy", "references");
}

// Keep text outside markers; keep a `<!-- diy:when key=a|b -->` section only
// when the config value matches.
function diyApplyVariants(text, cfg) {
  return text.replace(
    /<!-- diy:when ([a-z_]+)=([^ ]+) -->\r?\n([\s\S]*?)<!-- \/diy:when -->\r?\n?/g,
    (_, key, values, body) => (values.split("|").includes(String(cfg[key])) ? body : "")
  );
}

// Returns true on success, false on any abort — callable from the interactive
// menu (which must survive a failed compile) and from `orc diy compile` (which
// exits non-zero on false).
function diyCompile(claudeDir) {
  const p = diyPaths(claudeDir);
  const map = readDiyConfig(claudeDir);
  if (!map) {
    console.error("❌ no flow config — run `orc diy init` first.");
    return false;
  }
  const cfg = diyResolve(map);
  const { errors, warnings } = diyValidate(cfg);
  for (const w of warnings) console.log("  ⚠ " + w);
  if (errors.length) {
    for (const e of errors) console.error("  ❌ " + e);
    console.error("\n❌ compile aborted — fix the config with `orc diy set`, then retry.");
    return false;
  }

  const refDir = diyBlocksDir(claudeDir);
  let missingBlock = null;
  const readBlock = (name) => {
    const f = path.join(refDir, "blocks", name + ".md");
    if (!fs.existsSync(f)) {
      missingBlock = f;
      return "";
    }
    return fs.readFileSync(f, "utf8");
  };
  const locked = fs.readFileSync(path.join(refDir, "locked-blocks.md"), "utf8");

  const order = ["header", null, "wiki", "analyze", "planning", "pattern", "scoring", "execution", "review", "security", "verify", "testgen", "ship", "summary"];
  const tier = DIY_TIERS[cfg.session_tier];
  const subs = {
    flow_name: cfg.flow_name,
    config_hash: sha256(fs.readFileSync(p.config, "utf8")),
    orc_version: installedPayloadVersion(claudeDir),
    compiled_at: new Date().toISOString(),
    tier_model: tier.modelId,
    tier_effort: tier.effortName,
    max_wave_tasks: cfg.max_wave_tasks,
    batch_pause_every: cfg.batch_pause_every,
    fixed_executor: cfg.fixed_executor || "(unset)",
    score_table: diyScoreTable(cfg),
  };
  let out = order
    .map((name) => (name === null ? locked : diyApplyVariants(readBlock(name), cfg)))
    .join("\n")
    .replace(/\{\{([a-z_]+)\}\}/g, (_, k) => String(subs[k] !== undefined ? subs[k] : `{{${k}}}`));
  if (missingBlock) {
    console.error(`❌ block template missing: ${missingBlock} — reinstall with \`orc update\`.`);
    return false;
  }

  // Cherry-pick check: every orc file the chosen variants reference must
  // exist — project install first, global (~/.claude) fallback.
  const missing = [];
  for (const m of out.matchAll(/\.claude\/skills\/[A-Za-z0-9_/.-]+\.md/g)) {
    const rel = m[0];
    const inProject = path.join(path.dirname(claudeDir), rel);
    const inGlobal = path.join(os.homedir(), rel);
    if (!fs.existsSync(inProject) && !fs.existsSync(inGlobal)) missing.push(rel);
  }
  if (missing.length) {
    console.error("❌ compile aborted — this flow cherry-picks orc files that are not installed:");
    for (const f of [...new Set(missing)]) console.error("   - " + f);
    console.error("   Install/refresh orc here first: `orc init` (or `orc update`).");
    return false;
  }

  fs.mkdirSync(p.dir, { recursive: true });
  fs.writeFileSync(p.compiled, out);
  const lock = readDiyLock(claudeDir) || {};
  lock.flow_name = cfg.flow_name;
  lock.session_tier = cfg.session_tier;
  lock.config_hash = subs.config_hash;
  lock.flow_hash = sha256(fs.readFileSync(p.flow, "utf8"));
  lock.compiled_hash = sha256(out);
  lock.compiled_at = subs.compiled_at;
  lock.orc_version = subs.orc_version;
  fs.writeFileSync(p.lock, JSON.stringify(lock, null, 2) + "\n");
  const st = diyStatus(claudeDir);
  console.log(`\n✅ compiled → ${p.compiled}`);
  console.log(`   gate: ${st.state} — ${st.reason}`);
  console.log("   Run it with /orc-diy <request>.");
  return true;
}

function diyShow(claudeDir) {
  const map = readDiyConfig(claudeDir);
  const st = diyStatus(claudeDir);
  console.log(`\nORC-DIY  gate: ${st.state} — ${st.reason}\n`);
  if (!map) {
    console.log("Bootstrap:  orc diy init [--preset lean|paranoid|solo-fast]");
    console.log("Guide:      .claude/skills/orc-diy/README.md\n");
    return;
  }
  const cfg = diyResolve(map);
  const pad = Math.max(...DIY_META.map((m) => m.key.length));
  for (const m of DIY_META) {
    const overridden = m.key in map ? "set    " : "default";
    console.log(`  ${m.key.padEnd(pad)}  ${String(cfg[m.key] === "" ? "(unset)" : cfg[m.key]).padEnd(28)} ${overridden}  ${m.desc}`);
  }
  const { errors, warnings } = diyValidate(cfg);
  for (const e of errors) console.log("  ❌ " + e);
  for (const w of warnings) console.log("  ⚠ " + w);
  console.log("");
}

// Interactive flow composer — humans only (mirrors configInteractive). If
// stdin isn't a TTY (e.g. Claude's Bash tool), don't hang: show the table.
function diyInteractive(claudeDir) {
  if (!process.stdin.isTTY) {
    console.log("(non-interactive shell — showing the flow; use `orc diy set <key> <value>` to change)");
    diyShow(claudeDir);
    return;
  }
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  (async () => {
    // Bootstrap wizard when nothing exists yet.
    if (!readDiyConfig(claudeDir)) {
      console.log("\nORC-DIY — no flow in this project yet. Start from:\n");
      const presetNames = Object.keys(DIY_PRESETS);
      console.log("   1) full-lane defaults (everything on, like /orc)");
      presetNames.forEach((n, i) => {
        const changed = Object.entries(DIY_PRESETS[n])
          .filter(([k]) => k !== "flow_name")
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        console.log(`   ${i + 2}) preset: ${n}  (${changed})`);
      });
      console.log("   q) cancel");
      const c = (await ask("\n> ")).trim().toLowerCase();
      if (c === "q" || c === "") {
        rl.close();
        return;
      }
      const idx = Number(c);
      if (idx === 1) diyWriteConfig(claudeDir, {});
      else if (presetNames[idx - 2]) diyWriteConfig(claudeDir, { ...DIY_PRESETS[presetNames[idx - 2]] });
      else {
        console.log("  ? not a valid choice");
        rl.close();
        return;
      }
      console.log("  ✓ flow config created — now shape it below.");
    }

    for (;;) {
      const map = readDiyConfig(claudeDir);
      const cfg = diyResolve(map);
      const st = diyStatus(claudeDir);
      console.log(
        `\nORC-DIY flow composer — gate: ${st.state}` +
          (st.state === "READY" ? "" : `  (${st.reason})`) +
          "\n"
      );
      const pad = Math.max(...DIY_META.map((m) => m.key.length));
      DIY_META.forEach((m, i) => {
        const has = m.key in map;
        const val = cfg[m.key] === "" ? "(unset)" : cfg[m.key];
        console.log(
          `  ${String(i + 1).padStart(2)}) ${m.key.padEnd(pad)}  ${String(val).padEnd(28)} ${has ? "set" : "default"}`
        );
      });
      const { errors, warnings } = diyValidate(cfg);
      for (const e of errors) console.log("\n  ❌ " + e);
      for (const w of warnings) console.log("  ⚠ " + w);
      console.log("\n   c) compile now    v) validate    x) reset a key    q) quit");
      const choice = (await ask("\n> ")).trim().toLowerCase();
      if (choice === "" || choice === "q") break;
      if (choice === "c") {
        diyCompile(claudeDir);
        continue;
      }
      if (choice === "v") {
        if (!errors.length) console.log("  ✅ flow config valid" + (warnings.length ? " (with warnings above)" : ""));
        else console.log("  ❌ fix the errors above before compiling");
        continue;
      }
      if (choice === "x") {
        const k = (await ask("  reset which key (blank = cancel): ")).trim();
        if (!k) continue;
        if (!(k in map)) {
          console.log(`  ${k} has no explicit value — already at default.`);
          continue;
        }
        delete map[k];
        diyWriteConfig(claudeDir, map);
        console.log(`  ✓ ${k} back to default`);
        continue;
      }
      const m = DIY_META[Number(choice) - 1];
      if (!m) {
        console.log("  ? not a valid choice");
        continue;
      }
      console.log(`\n${m.key} — ${m.desc}`);
      console.log(`  current: ${cfg[m.key] === "" ? "(unset)" : cfg[m.key]}   default: ${m.def === "" ? "(unset)" : m.def}`);
      // String enums get a numbered pick-list (type the number OR the value);
      // numeric keys just take a value (numbers would be ambiguous as indexes).
      const numericOpts = m.options && m.options.every((o) => typeof o === "number");
      let prompt = "  new value (blank = keep): ";
      if (m.options && !numericOpts) {
        m.options.forEach((o, i) => console.log(`    ${i + 1}) ${o}`));
        prompt = "  pick a number or type a value (blank = keep): ";
      } else if (m.options) {
        console.log(`  common values: ${m.options.join(" | ")}`);
      }
      const nv = (await ask(prompt)).trim();
      if (!nv) {
        console.log("  (unchanged)");
        continue;
      }
      let candidate = nv;
      if (m.options && !numericOpts && /^\d+$/.test(nv) && m.options[Number(nv) - 1] !== undefined)
        candidate = String(m.options[Number(nv) - 1]);
      const res = m.validate(candidate);
      if (res.err) {
        console.log(`  invalid: ${res.err}`);
        continue;
      }
      map[m.key] = res.value;
      diyWriteConfig(claudeDir, map);
      console.log(`  ✓ ${m.key} = ${res.value}`);
    }

    // Leaving with an uncompiled change is the #1 footgun — offer the fix.
    if (diyStatus(claudeDir).state !== "READY") {
      const a = (await ask("\nGate is not READY — compile now so /orc-diy can run? (y/n) ")).trim();
      if (/^y/i.test(a)) diyCompile(claudeDir);
      else console.log("Skipped — /orc-diy stays gated until you run `orc diy compile`.");
    }
    rl.close();
    console.log("done.");
  })();
}

function diy() {
  if (flag("--global")) {
    console.error(
      "❌ orc diy is project-scoped — it never uses ~/.claude. Run it from the\n" +
        "   project (or with --dir <path>); one flow per project."
    );
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["diy", <sub?>, ...]
  const sub = pos[1];
  switch (sub) {
    case "init": {
      const p = diyPaths(claudeDir);
      if (fs.existsSync(p.config) && !flag("--force")) {
        console.error("A flow config already exists. Use `orc diy show` / `orc diy set`, or `orc diy init --force` to start over.");
        process.exit(1);
      }
      const presetName = typeof flag("--preset") === "string" ? flag("--preset") : null;
      if (presetName && !DIY_PRESETS[presetName]) {
        console.error(`Unknown preset: ${presetName}. Presets: ${Object.keys(DIY_PRESETS).join(", ")}`);
        process.exit(1);
      }
      const cfg = diyWriteConfig(claudeDir, presetName ? { ...DIY_PRESETS[presetName] } : {});
      console.log(`Created ${p.config}${presetName ? ` (preset: ${presetName})` : " (full-lane defaults)"}`);
      console.log(`Flow spec: ${p.flow}`);
      const { warnings } = diyValidate(cfg);
      for (const w of warnings) console.log("  ⚠ " + w);
      console.log("\nNext: shape it with `orc diy set <key> <value>`, then `orc diy compile`.");
      console.log("Guide: .claude/skills/orc-diy/README.md");
      break;
    }
    case "set": {
      const [, , key, rawValue] = pos;
      const m = diyMetaFor(key);
      if (!m) {
        console.error(`Unknown flow key: ${key}\nKnown keys: ${DIY_META.map((x) => x.key).join(", ")}`);
        process.exit(1);
      }
      if (rawValue === undefined) {
        console.error(`Usage: orc diy set ${key} <value>`);
        process.exit(1);
      }
      const res = m.validate(String(rawValue));
      if (res.err) {
        console.error(`Invalid value for ${key}: ${res.err}`);
        process.exit(1);
      }
      const map = readDiyConfig(claudeDir);
      if (!map) {
        console.error("No flow config yet — run `orc diy init` first.");
        process.exit(1);
      }
      map[key] = res.value;
      const cfg = diyWriteConfig(claudeDir, map);
      console.log(`Set ${key} = ${res.value}`);
      const { errors, warnings } = diyValidate(cfg);
      for (const e of errors) console.log("  ❌ " + e);
      for (const w of warnings) console.log("  ⚠ " + w);
      console.log("Flow changed → recompile before running: `orc diy compile`.");
      break;
    }
    case "validate": {
      const map = readDiyConfig(claudeDir);
      if (!map) {
        console.error("No flow config — run `orc diy init` first.");
        process.exit(1);
      }
      const { errors, warnings } = diyValidate(diyResolve(map));
      for (const e of errors) console.log("  ❌ " + e);
      for (const w of warnings) console.log("  ⚠ " + w);
      if (!errors.length) console.log("✅ flow config valid" + (warnings.length ? " (with warnings)" : ""));
      process.exit(errors.length ? 1 : 0);
      break;
    }
    case "compile":
      if (!diyCompile(claudeDir)) process.exit(1);
      break;
    case "status": {
      const st = diyStatus(claudeDir);
      if (args.includes("--json")) console.log(JSON.stringify(st));
      else console.log(`${st.state} — ${st.reason}`);
      break;
    }
    case "show":
      diyShow(claudeDir);
      break;
    case undefined:
      diyInteractive(claudeDir); // TTY menu; falls back to the table when piped
      break;
    case "reset": {
      const p = diyPaths(claudeDir);
      for (const f of [p.config, p.flow, p.lock, p.compiled]) {
        if (fs.existsSync(f)) {
          fs.rmSync(f);
          console.log("  del  " + f);
        }
      }
      console.log("orc-diy reset — /orc-diy is UNCONFIGURED again.");
      break;
    }
    default:
      console.error(
        `Unknown: orc diy ${sub}\n` +
          "Usage: orc diy                      (interactive flow composer)\n" +
          "       orc diy [show | init [--preset <name>] [--force] | set <key> <value> |\n" +
          "               validate | compile | status [--json] | reset]"
      );
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// orc crosslink — CLI-composed cross-repo wiki graph. The CLI is the ONLY writer
// of .claude/orc-crosslink.config.yaml (nodes + directed edges); orc-wiki only
// READS it (to publish this repo's boundary + resolve what it consumes from
// linked repos' wikis). Foreign footprint is read-only (wiki-meta.json + git),
// never source, never a write. Mirrors the orc-diy CLI-composes/skill-reads
// precedent. See templates/skills/orc-wiki/references/crosslink.md.
// ---------------------------------------------------------------------------

// Kinds catalog — MIRRORS templates/skills/orc-wiki/references/crosslink-kinds.md
// (documented drift, like DIY_PRESETS mirrors config.md). "Other" is always
// allowed at the prompt, so this list guides without gating.
const CROSSLINK_KINDS = [
  "grpc", "rest-endpoint", "graphql", "websocket", "message-queue", "webhook",
  "shared-db", "cache", "object-storage", "repository", "auth/oidc", "cron",
  "api-client", "graphql-client", "component-api", "state-store",
  "websocket-client", "sdk",
];

function crosslinkPaths(claudeDir) {
  const dir = path.join(claudeDir, "orc", "crosslink");
  return {
    config: path.join(claudeDir, "orc-crosslink.config.yaml"),
    dir,
    needs: path.join(dir, "needs.json"),
    cacheDir: path.join(dir, "cache"),
  };
}

// Repo ROOT = parent of the .claude dir.
const repoRootOf = (claudeDir) => path.dirname(claudeDir);

// self name: package.json name (scope stripped) → repo dir name.
function crosslinkSelfName(claudeDir) {
  const root = repoRootOf(claudeDir);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    if (pkg && pkg.name) return String(pkg.name).replace(/^@[^/]+\//, "");
  } catch (_) {}
  return path.basename(root) || "this-repo";
}

// Parse one `{ key: val, kinds: [a, b] }` flow map (our on-disk item form).
function parseCrosslinkFlow(inner) {
  const out = {};
  const km = inner.match(/kinds:\s*\[([^\]]*)\]/);
  if (km) {
    out.kinds = km[1].split(",").map((x) => x.trim()).filter(Boolean);
    inner = inner.replace(km[0], "");
  }
  for (const part of inner.split(",")) {
    const i = part.indexOf(":");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k) out[k] = v;
  }
  return out;
}

// Read a crosslink config from an ARBITRARY claude dir (used for self AND for
// the bulk-add peek into a linked repo). Returns {version, self, nodes, links}.
function readCrosslinkConfigAt(configPath) {
  if (!fs.existsSync(configPath)) return null;
  const cfg = { version: 1, self: null, nodes: [], links: [] };
  let section = null;
  for (const raw of fs.readFileSync(configPath, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith("#")) continue;
    if (/^version:/.test(t)) { cfg.version = Number(t.slice(8).trim()) || 1; continue; }
    if (/^self:/.test(t)) { cfg.self = t.slice(5).trim().replace(/^["']|["']$/g, ""); continue; }
    if (t === "nodes:") { section = "nodes"; continue; }
    if (t === "links:") { section = "links"; continue; }
    const fm = t.match(/^-\s*\{(.*)\}\s*$/);
    if (!fm) continue;
    if (section === "nodes") cfg.nodes.push(parseCrosslinkFlow(fm[1]));
    else if (section === "links") cfg.links.push(parseCrosslinkFlow(fm[1]));
  }
  return cfg;
}
const readCrosslinkConfig = (claudeDir) => readCrosslinkConfigAt(crosslinkPaths(claudeDir).config);

function writeCrosslinkConfig(claudeDir, cfg) {
  const p = crosslinkPaths(claudeDir);
  fs.mkdirSync(path.dirname(p.config), { recursive: true });
  let out =
    "# .claude/orc-crosslink.config.yaml — cross-repo wiki links (managed by `orc crosslink`).\n" +
    "# Never hand-edit — orc-wiki READS this to publish this repo's boundary and\n" +
    "# resolve the contracts it consumes from linked repos. Foreign reads only.\n" +
    `version: ${cfg.version || 1}\n` +
    `self: ${serializeValue(cfg.self)}\n` +
    "nodes:\n";
  for (const n of cfg.nodes)
    out += `  - {name: ${n.name}, repo_path: ${n.repo_path}, kinds: [${(n.kinds || []).join(", ")}]}\n`;
  out += "links:\n";
  for (const l of cfg.links) out += `  - {from: ${l.from}, to: ${l.to}, via: ${l.via}}\n`;
  fs.writeFileSync(p.config, out);
  return p.config;
}

// Two paths point at the same repo? Compare realpaths, fall back to normalized.
function sameRepo(a, b) {
  const norm = (p) => {
    try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); }
  };
  return norm(a) === norm(b);
}

// Provider info for a linked repo ROOT: does it have a wiki, its last_scan, its
// git-distance tier (read-only), and how many crosslink tags it publishes.
//
// A missing manifest is NOT the same as a missing wiki (references/staleness.md:
// docs without a manifest = a real wiki that nothing has registered). Collapsing
// the two sent people off to re-scan repos that were already fully scanned, so
// the three failure states stay distinct: no-wiki / unregistered / corrupt.
function crosslinkProviderInfo(repoRoot) {
  if (!fs.existsSync(repoRoot)) return { state: "missing" };
  const metaPath = path.join(repoRoot, ".claude", "orc", "wiki-meta.json");
  const docs = readWikiDocs(path.join(repoRoot, "wiki")).docs.length;
  if (!fs.existsSync(metaPath)) return docs ? { state: "unregistered", docs } : { state: "no-wiki" };
  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8").replace(/^﻿/, "")); }
  catch (_) { return { state: "corrupt", docs }; }
  const info = {
    state: "wiki",
    last_scan: meta.last_scan || null,
    tier: null,
    tags: Array.isArray(meta.crosslink_provided) ? meta.crosslink_provided.length : 0,
  };
  if (meta.scan_commit) {
    const r = spawnSync("git", ["rev-list", "--count", `${meta.scan_commit}..HEAD`], {
      cwd: repoRoot, encoding: "utf8",
    });
    if (r.status === 0 && r.stdout && /^\d+$/.test(r.stdout.trim())) {
      const d = Number(r.stdout.trim());
      info.tier = d < 10 ? "FRESH" : d <= 30 ? "AGING" : "STALE"; // default edges
    }
  }
  return info;
}

// Which way does a node relate to us? We RESOLVE tags only from repos we CALL;
// a repo that only calls US is a consumer (references/crosslink.md: "Discovery
// runs only the consume side of edges. Provider-only edges create no needs").
function crosslinkDirection(cfg, nodeName) {
  const isSelf = (x) => x === "self" || x === cfg.self;
  let consume = false;
  let provide = false;
  for (const l of cfg.links) {
    if (isSelf(l.from) && l.to === nodeName) consume = true;
    if (isSelf(l.to) && l.from === nodeName) provide = true;
  }
  return consume ? "consume" : provide ? "provide" : "none";
}

// One-line freshness report for a pasted/added repo path. `dir` is the edge
// direction from crosslinkDirection (omit at paste time, when no edge exists
// yet and the report is just "what is this repo?").
function crosslinkProviderLine(claudeDir, repoPath, dir) {
  const root = path.resolve(repoRootOf(claudeDir), repoPath);
  const info = crosslinkProviderInfo(root);
  if (info.state === "missing") return "  ✗ path not found — will be saved as a PENDING edge (resolves when the path appears)";
  // Their tags only matter if WE call THEM. For an inbound-only edge we read
  // nothing from that repo, so reporting "no crosslink tags" states a fact that
  // is both irrelevant and unfixable: a pure client (a frontend api-client) has
  // no API of its own to publish, so it would never grow tags and the warning
  // would never clear.
  if (dir === "provide")
    return (
      "  ✓ inbound only (they call us) — we resolve nothing from them, so their tags and freshness don't matter here.\n" +
      "     Nothing to do in that repo. For THEM to use OUR contracts, they run `orc crosslink` in THEIR repo and link us."
    );
  if (dir === "none")
    return "  ⚠ linked, but no edge yet — add one with `orc crosslink`; a node without an edge does nothing";
  if (info.state === "no-wiki") return "  ⚠ no wiki there — run `/orc-wiki` in that repo first (edge saved, inert until then)";
  if (info.state === "unregistered")
    return `  ⚠ wiki found (${plural(info.docs, "doc")}) but UNREGISTERED — no wiki-meta.json, so nothing can read it.\n` +
      "     Fix in that repo: `orc wiki sync` — instant, no re-scan (edge saved, inert until then)";
  if (info.state === "corrupt")
    return "  ⚠ wiki-meta.json there is unreadable (corrupt JSON) — run `orc wiki sync` in that repo to rebuild it";
  const tier = info.tier ? info.tier : "tier unknown (git unavailable there — using date only)";
  const head = `  ✓ wiki found · last_scan ${info.last_scan || "?"} · ${tier} · `;
  if (info.tags) return head + plural(info.tags, "crosslink tag");
  // Tags are published BY the provider — the repo being CALLED — so this is
  // never fixable from here. Say where, or the reader reasonably tries to fix
  // it in the repo they're standing in (the consumer), which changes nothing.
  return (
    head + "no crosslink tags yet (coarse hints only)\n" +
    `     Tags are published by the repo being called: run \`/orc-wiki crosslink\` IN ${repoPath}\n` +
    "     — publishes from its existing docs, no re-scan. Running it here publishes OUR surface, not theirs."
  );
}

// Bulk-add peek: edges in the linked repo's OWN config that touch us, expressed
// in THIS repo's namespace. `nodeName` is what we call the linked repo here.
function crosslinkPeek(claudeDir, nodeName, repoPath) {
  const ourRoot = repoRootOf(claudeDir);
  const theirRoot = path.resolve(ourRoot, repoPath);
  const theirCfg = readCrosslinkConfigAt(path.join(theirRoot, ".claude", "orc-crosslink.config.yaml"));
  if (!theirCfg) return { has: false, mirrors: [] };
  const nodeByName = (c, n) => c.nodes.find((x) => x.name === n) || (c.self === n ? { name: n, repo_path: "." } : null);
  const mirrors = [];
  for (const l of theirCfg.links) {
    const fromNode = nodeByName(theirCfg, l.from);
    const toNode = nodeByName(theirCfg, l.to);
    if (!fromNode || !toNode || !l.via) continue;
    // Which end is US (resolves to ourRoot), which is THEM (their self)?
    const fromIsUs = fromNode.repo_path && sameRepo(path.resolve(theirRoot, fromNode.repo_path), ourRoot);
    const toIsUs = toNode.repo_path && sameRepo(path.resolve(theirRoot, toNode.repo_path), ourRoot);
    if (toIsUs && l.from === theirCfg.self) mirrors.push({ from: nodeName, to: "self", via: l.via }); // they call us
    else if (fromIsUs && l.to === theirCfg.self) mirrors.push({ from: "self", to: nodeName, via: l.via }); // we call them
  }
  return { has: true, mirrors };
}

// Offer once to gitignore the derived cache dir. Never edits silently.
async function crosslinkGitignoreOffer(claudeDir, ask) {
  const root = repoRootOf(claudeDir);
  const giPath = path.join(root, ".gitignore");
  const line = ".claude/orc/crosslink/cache/";
  let body = "";
  try { body = fs.readFileSync(giPath, "utf8"); } catch (_) {}
  if (body.split(/\r?\n/).some((l) => l.trim() === line)) return;
  const a = (await ask(`\nAdd derived cache to .gitignore (${line})? (y/n) `)).trim();
  if (/^y/i.test(a)) {
    fs.writeFileSync(giPath, (body && !body.endsWith("\n") ? body + "\n" : body) + line + "\n");
    console.log("  ✓ appended to .gitignore");
  } else {
    console.log(`  skipped — add it yourself so the derived cache isn't committed: ${line}`);
  }
}

function crosslinkEnsureSelf(claudeDir) {
  let cfg = readCrosslinkConfig(claudeDir);
  if (!cfg) cfg = { version: 1, self: crosslinkSelfName(claudeDir), nodes: [], links: [] };
  if (!cfg.self) cfg.self = crosslinkSelfName(claudeDir);
  return cfg;
}

function crosslinkList(claudeDir) {
  const cfg = readCrosslinkConfig(claudeDir);
  if (!cfg || !cfg.nodes.length) {
    console.log("\nNo cross-repo links yet. Add one with `orc crosslink` (interactive).\n");
    return;
  }
  console.log(`\nCrosslink graph — self: ${cfg.self}\n\nLinked repos:`);
  for (const n of cfg.nodes) {
    console.log(`  • ${n.name}  (${n.repo_path})  kinds: ${(n.kinds || []).join(", ") || "—"}`);
    console.log("   " + crosslinkProviderLine(claudeDir, n.repo_path, crosslinkDirection(cfg, n.name)));
  }
  console.log("\nEdges:");
  for (const l of cfg.links) {
    const arrow = l.from === "self" || l.from === cfg.self ? "we CALL" : l.to === "self" || l.to === cfg.self ? "they CALL us" : "";
    console.log(`  ${l.from} ──${l.via}──▶ ${l.to}   (${arrow}${(l.from === "self" || l.from === cfg.self) ? " → drift-checked" : ""})`);
  }
  console.log("");
}

function crosslinkStatus(claudeDir) {
  const cfg = readCrosslinkConfig(claudeDir);
  if (!cfg) { console.log("UNCONFIGURED — no cross-repo links. Run `orc crosslink`."); return; }
  console.log(`\nCrosslink status — self: ${cfg.self}, ${cfg.nodes.length} linked repo(s), ${cfg.links.length} edge(s)\n`);
  for (const n of cfg.nodes)
    console.log(`  ${n.name}:\n  ${crosslinkProviderLine(claudeDir, n.repo_path, crosslinkDirection(cfg, n.name))}`);
  const needs = crosslinkPaths(claudeDir).needs;
  console.log(fs.existsSync(needs)
    ? `\n  needs baseline: ${needs} (per-point tags orc-wiki resolved)`
    : "\n  needs baseline: not built yet — run `/orc-wiki` here to resolve per-point tags + cache.");
  console.log("");
}

function crosslinkRemove(claudeDir, name) {
  const cfg = readCrosslinkConfig(claudeDir);
  if (!cfg) { console.error("No crosslink config."); process.exit(1); }
  if (!cfg.nodes.some((n) => n.name === name)) { console.error(`No linked repo named "${name}".`); process.exit(1); }
  cfg.nodes = cfg.nodes.filter((n) => n.name !== name);
  cfg.links = cfg.links.filter((l) => l.from !== name && l.to !== name);
  writeCrosslinkConfig(claudeDir, cfg);
  console.log(`Removed ${name} and its edges.`);
}

function crosslinkInteractive(claudeDir) {
  if (!process.stdin.isTTY) {
    console.log("(non-interactive shell — showing the graph; add links from a real terminal with `orc crosslink`)");
    crosslinkList(claudeDir);
    return;
  }
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  (async () => {
    const firstTime = !fs.existsSync(crosslinkPaths(claudeDir).config);
    let cfg = crosslinkEnsureSelf(claudeDir);
    for (;;) {
      console.log(`\nORC crosslink — self: ${cfg.self}  ·  ${cfg.nodes.length} linked repo(s), ${cfg.links.length} edge(s)`);
      console.log("  [1] add linked repo   [2] list   [3] remove   [4] done");
      const choice = (await ask("\n> ")).trim().toLowerCase();
      if (choice === "" || choice === "4" || choice === "q") break;
      if (choice === "2") { crosslinkList(claudeDir); continue; }
      if (choice === "3") {
        if (!cfg.nodes.length) { console.log("  nothing to remove"); continue; }
        cfg.nodes.forEach((n, i) => console.log(`   ${i + 1}) ${n.name}`));
        const r = (await ask("  remove which (number, blank = cancel): ")).trim();
        const n = cfg.nodes[Number(r) - 1];
        if (!n) continue;
        cfg.nodes = cfg.nodes.filter((x) => x !== n);
        cfg.links = cfg.links.filter((l) => l.from !== n.name && l.to !== n.name);
        writeCrosslinkConfig(claudeDir, cfg);
        console.log(`  ✓ removed ${n.name}`);
        continue;
      }
      if (choice !== "1") { console.log("  ? not a valid choice"); continue; }

      // --- add flow ---
      const name = (await ask("\n  name for the linked repo (slug): ")).trim();
      if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) { console.log("  invalid slug — a-z, 0-9, dashes"); continue; }
      if (cfg.nodes.some((n) => n.name === name) || name === cfg.self) { console.log("  that name is taken (or is self)"); continue; }
      const repoPath = (await ask("  repo path (repo ROOT, relative to this repo, e.g. ../service-z): ")).trim();
      if (!repoPath) { console.log("  a path is required"); continue; }
      console.log(crosslinkProviderLine(claudeDir, repoPath));

      // kinds multi-pick
      console.log("\n  kinds this repo exposes/consumes (catalog):");
      CROSSLINK_KINDS.forEach((k, i) => process.stdout.write(`   ${String(i + 1).padStart(2)}) ${k}${(i % 3 === 2) ? "\n" : "\t"}`));
      console.log("\n   or type your own (comma-separated), e.g. `1,3,grpc-stream`");
      const rawKinds = (await ask("  pick (numbers and/or names, comma-separated): ")).trim();
      const kinds = [...new Set(rawKinds.split(",").map((x) => x.trim()).filter(Boolean).map((tok) =>
        /^\d+$/.test(tok) && CROSSLINK_KINDS[Number(tok) - 1] ? CROSSLINK_KINDS[Number(tok) - 1] : tok.toLowerCase()
      ))];
      if (!kinds.length) { console.log("  at least one kind is required"); continue; }

      // direction
      const dir = (await ask("\n  direction?  [1] this repo CALLS them   [2] they CALL this repo\n  > ")).trim();
      const weCall = dir === "1";
      if (dir !== "1" && dir !== "2") { console.log("  pick 1 or 2"); continue; }

      // target (option 1 = self, always)
      const targets = [cfg.self, ...cfg.nodes.map((n) => n.name)];
      console.log("\n  linked to which repo?");
      console.log(`   1) this repo (${cfg.self})`);
      cfg.nodes.forEach((n, i) => console.log(`   ${i + 2}) ${n.name}`));
      const tRaw = (await ask("  > ")).trim();
      const tIdx = Number(tRaw) - 1;
      const target = targets[tIdx];
      if (!target) { console.log("  invalid target"); continue; }
      const targetKey = tIdx === 0 ? "self" : target;

      // which kind carries this edge
      const via = kinds.length === 1 ? kinds[0] : (await ask(`  which kind carries this edge? (${kinds.join(", ")}): `)).trim().toLowerCase();
      if (!kinds.includes(via)) { console.log("  edge kind must be one of the picked kinds"); continue; }

      cfg.nodes.push({ name, repo_path: repoPath, kinds });
      // Direction [1] "this repo CALLS them": target (default self) → new node.
      // Direction [2] "they CALL this repo": new node → target. Drift runs only
      // on edges whose `from` is self (self is the consumer).
      const finalEdge = weCall
        ? { from: targetKey, to: name, via }
        : { from: name, to: targetKey, via };
      cfg.links.push(finalEdge);
      writeCrosslinkConfig(claudeDir, cfg);
      console.log(`  ✓ added ${name}  ·  edge ${finalEdge.from} ──${via}──▶ ${finalEdge.to}${finalEdge.from === "self" ? "  (we consume → drift-checked)" : ""}`);

      // bulk-add peek
      const peek = crosslinkPeek(claudeDir, name, repoPath);
      if (peek.has && peek.mirrors.length) {
        for (const m of peek.mirrors) {
          if (cfg.links.some((l) => l.from === m.from && l.to === m.to && l.via === m.via)) continue;
          const a = (await ask(`  ${name} also declares ${m.from} ──${m.via}──▶ ${m.to} — mirror it into your config? (y/n) `)).trim();
          if (/^y/i.test(a)) { cfg.links.push(m); writeCrosslinkConfig(claudeDir, cfg); console.log("   ✓ mirrored"); }
        }
      } else if (peek.has) {
        // topology check: we declared an edge but they don't reciprocate
        console.log("   (peeked their config — no reciprocal edge to mirror)");
      } else {
        console.log("   (no crosslink config in that repo yet — link stands; it gets richer when they adopt crosslink)");
      }
    }

    if (firstTime && fs.existsSync(crosslinkPaths(claudeDir).config)) await crosslinkGitignoreOffer(claudeDir, ask);
    rl.close();
    console.log("\ndone. Run `/orc-wiki` here to resolve per-point tags + cache (and to publish this repo's own boundary).");
  })();
}

function crosslink() {
  if (flag("--global")) {
    console.error("❌ orc crosslink is project-scoped — it never uses ~/.claude. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["crosslink", <sub?>, ...]
  switch (pos[1]) {
    case undefined:
      crosslinkInteractive(claudeDir);
      break;
    case "list":
    case "show":
      crosslinkList(claudeDir);
      break;
    case "status":
      crosslinkStatus(claudeDir);
      break;
    case "remove":
      crosslinkRemove(claudeDir, pos[2]);
      break;
    default:
      console.error(
        `Unknown: orc crosslink ${pos[1]}\n` +
          "Usage: orc crosslink                 (interactive: add/list/remove/done)\n" +
          "       orc crosslink [list | status | remove <name>]"
      );
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// orc wiki — REGISTRATION of the knowledge base (wiki-meta.json + wiki/INDEX.md).
//
// Split of duties: the orc-wiki skill writes the DOCS (prose — it takes a model
// to read code and summarize it). Registration is DERIVED data: every field the
// manifest needs already lives in the docs' own headers (schemas/wiki-doc.md).
// So the CLI owns registration outright — deterministic, instant, no model, no
// re-scan, and repairable at any time.
//
// Why this exists: registration used to be Phase 3 step 5 of the skill — the
// LAST step of a lane that pauses every 5 scan-tasks by design. A run stopped at
// a pause left real docs on disk that nothing had indexed: invisible to every
// consumer, and `orc crosslink` reported the repo as having no wiki at all.
// Deriving registration from the docs makes a paused wiki a VALID wiki with
// partial coverage. See templates/skills/orc-wiki/references/staleness.md.
// ---------------------------------------------------------------------------

function wikiPaths(claudeDir) {
  const root = repoRootOf(claudeDir);
  const wikiDir = path.join(root, "wiki");
  return {
    root,
    wikiDir,
    index: path.join(wikiDir, "INDEX.md"),
    crosslinkDir: path.join(wikiDir, "crosslink"),
    meta: path.join(claudeDir, "orc", "wiki-meta.json"),
  };
}

const unquote = (s) => String(s == null ? "" : s).trim().replace(/^["']|["']$/g, "");
const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + "s"}`;

// Minimal frontmatter reader — the exact subset schemas/wiki-doc.md uses:
// scalars, inline arrays (`covers: [a, b]`), and one nested map level
// (`covered_files:` + indented `path: hash`). No YAML dep, by house rule.
function parseDocHeader(text) {
  const m = text.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const h = {};
  let mapKey = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (/^\s+\S/.test(raw) && mapKey) {
      const kv = raw.trim().replace(/\s+#.*$/, "").match(/^(.+?):\s*(.*)$/);
      if (kv) h[mapKey][unquote(kv[1])] = unquote(kv[2]);
      continue;
    }
    const kv = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    mapKey = null;
    const key = kv[1];
    const val = kv[2].replace(/\s+#.*$/, "").trim();
    if (val === "") { h[key] = {}; mapKey = key; continue; }
    if (val.startsWith("[")) {
      h[key] = val.replace(/^\[|\]$/g, "").split(",").map((s) => unquote(s)).filter(Boolean);
      continue;
    }
    h[key] = unquote(val);
  }
  return h;
}

// Every wiki doc under wiki/, skipping the machine index (crosslink/), the
// archive, and INDEX.md itself. A .md without a doc_type header is not a wiki
// doc — reported, never silently folded into the registry.
function readWikiDocs(wikiDir) {
  const docs = [];
  const skipped = [];
  if (!fs.existsSync(wikiDir)) return { docs, skipped };
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "crosslink" || e.name === "archive") continue;
        walk(abs);
        continue;
      }
      if (!e.name.endsWith(".md") || e.name === "INDEX.md") continue;
      const rel = path.relative(path.dirname(wikiDir), abs).split(path.sep).join("/");
      const text = fs.readFileSync(abs, "utf8");
      const header = parseDocHeader(text);
      if (!header || !header.doc_type) { skipped.push(rel); continue; }
      docs.push({ abs, rel, header, text });
    }
  };
  walk(wikiDir);
  docs.sort((a, b) => a.rel.localeCompare(b.rel));
  return { docs, skipped };
}

// INDEX.md needs a one-line description, which is the one thing NO header field
// carries. Derive it: first TL;DR bullet, else the first prose line under the
// H1. Never invent one — an underivable description is left blank.
function docDescription(text) {
  const body = text.replace(/^﻿/, "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const tldr = body.match(/^##\s+TL;DR[^\n]*\n([\s\S]*?)(?=\n##\s|$)/m);
  const pick = (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      const t = line.replace(/^[-*]\s+/, "").trim();
      if (!t || t.startsWith("#") || t.startsWith("<")) continue;
      return t.replace(/\s+/g, " ").replace(/[.\s]+$/, "");
    }
    return "";
  };
  let d = tldr ? pick(tldr[1]) : "";
  if (!d) d = pick(body.replace(/^#[^\n]*\n/, ""));
  return d.length > 120 ? d.slice(0, 117).trimEnd() + "…" : d;
}

function gitIn(root, argv) {
  const r = spawnSync("git", argv, { cwd: root, encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.trim();
}

// The wiki as a whole is only as fresh as its OLDEST doc — anything committed
// after that point may be undocumented. So the manifest anchor is the oldest
// resolvable scanned_commit (greatest distance from HEAD), never the newest:
// overstating freshness is the one error a freshness anchor must not make.
function oldestCommit(root, commits) {
  let best = null;
  for (const c of commits) {
    const out = gitIn(root, ["rev-list", "--count", `${c}..HEAD`]);
    if (out === null || !/^\d+$/.test(out)) continue;
    const d = Number(out);
    if (!best || d > best.distance) best = { commit: c, distance: d };
  }
  return best;
}

const two = (n) => String(n).padStart(2, "0");
const fmtStamp = (d) =>
  `${two(d.getDate())}-${two(d.getMonth() + 1)}-${d.getFullYear()} ` +
  `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;

// Doc headers stamp `scanned_at: DDMMYY HH:MM:SS`; the manifest wants
// dd-mm-yyyy hh:mm:ss. Convert, else fall back to the file's mtime.
function parseScannedAt(v) {
  const m = String(v || "").match(/^(\d{2})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(2000 + +m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
  return isNaN(d.getTime()) ? null : d;
}

// build/test/lint are discovered during the scan and live in NO doc header, so
// they cannot be derived. Preserve what a previous manifest knew; else read
// package.json scripts. Never guess a command the project doesn't declare.
function detectCommands(root, prev) {
  if (prev && typeof prev === "object" && Object.keys(prev).length) return prev;
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  let scripts;
  try { scripts = (JSON.parse(fs.readFileSync(pkgPath, "utf8")) || {}).scripts || {}; }
  catch (_) { return null; }
  const out = {};
  if (scripts.build) out.build = "npm run build";
  if (scripts.test) out.test_fast = "npm test";
  if (scripts.lint) out.lint = "npm run lint";
  return Object.keys(out).length ? out : null;
}

// crosslink_provided is an INDEX of the tag files, so it is derived like the
// rest of registration. The tag FILES stay model-written (they carry scanned
// contract prose + evidence anchors); this only re-indexes them.
function readCrosslinkProvided(paths) {
  if (!fs.existsSync(paths.crosslinkDir)) return [];
  const out = [];
  for (const kind of fs.readdirSync(paths.crosslinkDir, { withFileTypes: true })) {
    if (!kind.isDirectory()) continue;
    const kindDir = path.join(paths.crosslinkDir, kind.name);
    for (const f of fs.readdirSync(kindDir)) {
      if (!f.endsWith(".md")) continue;
      const abs = path.join(kindDir, f);
      const h = parseDocHeader(fs.readFileSync(abs, "utf8"));
      if (!h || !h.tag) continue;
      out.push({
        tag: h.tag,
        kind: h.kind || kind.name,
        file: path.relative(paths.root, abs).split(path.sep).join("/"),
        anchor: h.anchor || null,
        content_hash: h.content_hash || null,
      });
    }
  }
  out.sort((a, b) => a.tag.localeCompare(b.tag));
  return out;
}

// Cheap boundary detector (plan v0.24.0 §B1). A non-empty `## Contracts & shapes`
// table means the repo DOCUMENTS an outward boundary, so it MUST have published
// crosslink tags. Counting rows here lets sync catch "boundary documented but
// nothing published" without a model — the reader already has each doc's text.
// Counts data rows only (header + separator excluded); sums across docs.
function countBoundaryRows(docs) {
  let rows = 0;
  for (const d of docs) {
    const m = d.text.match(/(?:^|\r?\n)##\s+Contracts?\s*&\s*shapes[^\n]*\r?\n([\s\S]*?)(?=\r?\n##\s|$)/i);
    if (!m) continue;
    const pipeLines = m[1]
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|"));
    // Drop markdown separator rows (`|---|:--:|`); what's left is header + data.
    const content = pipeLines.filter((l) => !/^\|[\s|:-]+$/.test(l));
    if (content.length >= 2) rows += content.length - 1; // minus the header row
  }
  return rows;
}

function readMetaAt(metaPath) {
  if (!fs.existsSync(metaPath)) return { state: "absent", meta: null };
  try {
    return { state: "ok", meta: JSON.parse(fs.readFileSync(metaPath, "utf8").replace(/^﻿/, "")) };
  } catch (_) {
    return { state: "corrupt", meta: null };
  }
}

// Derive the full registration for whatever docs exist right now.
function buildRegistration(claudeDir) {
  const paths = wikiPaths(claudeDir);
  const { docs, skipped } = readWikiDocs(paths.wikiDir);
  const prev = readMetaAt(paths.meta);

  const registry = docs.map((d) => {
    const e = {
      file: d.rel,
      area: d.header.area || path.basename(d.rel, ".md"),
      doc_type: d.header.doc_type,
      covers: Array.isArray(d.header.covers) ? d.header.covers : [],
      // v1 docs carry a single covered_hash and no per-file map — keep them
      // usable rather than forcing a re-scan; the next refresh upgrades them.
      covered_files:
        d.header.covered_files && typeof d.header.covered_files === "object"
          ? d.header.covered_files
          : {},
      scanned_commit: d.header.scanned_commit || null,
    };
    if (!Object.keys(e.covered_files).length && d.header.covered_hash) {
      e.covered_hash = d.header.covered_hash;
    }
    return e;
  });

  const anchor = oldestCommit(paths.root, [
    ...new Set(registry.map((e) => e.scanned_commit).filter(Boolean)),
  ]);

  let stamp = null;
  for (const d of docs) {
    const at = parseScannedAt(d.header.scanned_at) || fs.statSync(d.abs).mtime;
    if (!stamp || at < stamp) stamp = at; // oldest, matching the commit anchor
  }

  const meta = Object.assign({}, prev.meta || {}, {
    last_scan: stamp ? fmtStamp(stamp) : fmtStamp(new Date()),
    branch: gitIn(paths.root, ["rev-parse", "--abbrev-ref", "HEAD"]) || null,
    pages: registry.length,
    docs: registry,
  });
  if (anchor) meta.scan_commit = anchor.commit;
  else delete meta.scan_commit; // unresolvable → consumers treat as pre-manifest

  const commands = detectCommands(paths.root, (prev.meta || {}).commands);
  if (commands) meta.commands = commands;
  else delete meta.commands;

  const provided = readCrosslinkProvided(paths);
  if (provided.length) meta.crosslink_provided = provided;
  else delete meta.crosslink_provided;

  // Guard signals (plan v0.24.0 §B): boundary_rows lets sync flag a documented
  // boundary with no published tags; prevProvided drives the N→0 tripwire. Sync
  // stays a truthful deriver — these only WARN + fail `--check`, never rewrite.
  const boundaryRows = countBoundaryRows(docs);
  const prevProvided = Array.isArray((prev.meta || {}).crosslink_provided)
    ? prev.meta.crosslink_provided.length
    : 0;

  const lines = docs.map((d) => {
    const e = registry.find((r) => r.file === d.rel);
    const kw = Array.isArray(d.header.keywords) ? d.header.keywords : [];
    const desc = docDescription(d.text);
    return (
      `- ${d.rel} · ${e.doc_type} · ${d.header.status || "fresh"}` +
      (desc ? ` — ${desc}` : "") +
      (kw.length ? ` · kw: ${kw.join(", ")}` : "")
    );
  });
  const index =
    "# Wiki Index\n\n" +
    "<!-- Derived by `orc wiki sync` from the docs' headers. Do not hand-edit —\n" +
    "     edit a doc's header and re-run sync. -->\n\n" +
    (lines.length ? lines.join("\n") + "\n" : "_No wiki docs yet._\n");

  return { paths, docs, skipped, registry, meta, index, prev, anchor, provided, boundaryRows, prevProvided };
}

// The registration state of THIS repo's wiki — the vocabulary every consumer
// and message uses. "unregistered" is the state that used to masquerade as
// "no wiki at all".
function wikiState(claudeDir) {
  const paths = wikiPaths(claudeDir);
  const { docs } = readWikiDocs(paths.wikiDir);
  const prev = readMetaAt(paths.meta);
  if (!docs.length && prev.state !== "ok") return { state: "none", docs: 0 };
  if (prev.state === "corrupt") return { state: "corrupt", docs: docs.length };
  if (prev.state === "absent") return { state: "unregistered", docs: docs.length };
  const known = new Set(((prev.meta || {}).docs || []).map((d) => d.file));
  const have = new Set(docs.map((d) => d.rel));
  const added = [...have].filter((f) => !known.has(f));
  const dropped = [...known].filter((f) => !have.has(f));
  if (added.length || dropped.length)
    return { state: "drifted", docs: docs.length, added, dropped };
  return { state: "registered", docs: docs.length, meta: prev.meta };
}

function wikiSync(claudeDir, { check } = {}) {
  const r = buildRegistration(claudeDir);
  if (!fs.existsSync(r.paths.wikiDir) || !r.docs.length) {
    console.error(
      "❌ no wiki docs found at " + r.paths.wikiDir + "\n" +
        "   `orc wiki sync` registers docs that already exist — it never scans.\n" +
        "   Run `/orc-wiki` in Claude Code to build the knowledge base first."
    );
    process.exit(1);
  }

  const before = wikiState(claudeDir);
  const nextMeta = JSON.stringify(r.meta, null, 2) + "\n";
  const curMeta = fs.existsSync(r.paths.meta) ? fs.readFileSync(r.paths.meta, "utf8") : null;
  const curIndex = fs.existsSync(r.paths.index) ? fs.readFileSync(r.paths.index, "utf8") : null;
  const changed = curMeta !== nextMeta || curIndex !== r.index;

  // Crosslink publish guards (plan v0.24.0 §B). Both are LOCAL-artifact integrity
  // (our own tags vs our own docs) — always gateable, they just never were.
  //   boundaryUnpublished: docs describe a boundary but zero tags on disk.
  //   n0trip: the manifest listed tags, now the folder is empty (a wipe).
  const boundaryUnpublished = r.boundaryRows > 0 && r.provided.length === 0;
  const n0trip = r.prevProvided > 0 && r.provided.length === 0;
  const crosslinkAlarm = boundaryUnpublished || n0trip;
  const alarmLines = () => {
    if (n0trip)
      console.error(
        `⚠ crosslink tags VANISHED — the manifest listed ${plural(r.prevProvided, "tag")}, now wiki/crosslink/ is empty.\n` +
          "   A wiki regenerate must never wipe the boundary. Restore from the docs (no re-scan):\n" +
          "     `/orc-wiki crosslink`\n" +
          "   If the boundary genuinely went away, re-run `orc wiki sync` to accept the removal."
      );
    else if (boundaryUnpublished)
      console.error(
        `⚠ boundary documented but NO crosslink tags published — ${plural(r.boundaryRows, "Contracts & shapes row")} on disk, wiki/crosslink/ is empty.\n` +
          "   Backfill from the docs the repo already has (no re-scan): `/orc-wiki crosslink`."
      );
  };

  if (check) {
    if (changed) console.log(`⚠ out of sync (${before.state}) — run \`orc wiki sync\``);
    else if (!crosslinkAlarm) console.log("✓ wiki registration in sync");
    if (crosslinkAlarm) alarmLines();
    process.exit(changed || crosslinkAlarm ? 1 : 0);
  }

  fs.mkdirSync(path.dirname(r.paths.meta), { recursive: true });
  fs.writeFileSync(r.paths.meta, nextMeta);
  fs.writeFileSync(r.paths.index, r.index);

  console.log(changed ? "✅ wiki registered" : "✅ wiki registration already in sync");
  console.log(`   ${plural(r.registry.length, "doc")} indexed → ${path.relative(r.paths.root, r.paths.index).split(path.sep).join("/")}`);
  console.log(`   manifest → ${path.relative(r.paths.root, r.paths.meta).split(path.sep).join("/")}`);
  if (r.anchor)
    console.log(`   scan_commit ${r.anchor.commit.slice(0, 8)} (oldest doc — ${r.anchor.distance} commits behind HEAD)`);
  else
    console.log("   ⚠ no resolvable scanned_commit in any doc — freshness tracking stays off until the next /orc-wiki refresh");
  if (r.provided.length) console.log(`   ${plural(r.provided.length, "crosslink tag")} indexed`);
  if (crosslinkAlarm) { console.log(""); alarmLines(); }
  if (!r.meta.commands)
    console.log("   ⚠ no build/test commands recorded — orc-fast's smoke gate will rediscover them (a /orc-wiki refresh fills this in)");
  if (r.skipped.length)
    console.log(`   ⚠ skipped (no doc_type header): ${r.skipped.join(", ")}`);
  console.log("\n   Registration only — nothing was scanned and no doc was changed.");
}

function wikiStatus(claudeDir) {
  const s = wikiState(claudeDir);
  const paths = wikiPaths(claudeDir);
  switch (s.state) {
    case "none":
      console.log("no wiki — run `/orc-wiki` in Claude Code to build one");
      break;
    case "unregistered":
      console.log(
        `⚠ UNREGISTERED — ${plural(s.docs, "doc")} at ${paths.wikiDir}, but no wiki-meta.json.\n` +
          "  Nothing can see this wiki (consumers and `orc crosslink` read the manifest).\n" +
          "  Fix: `orc wiki sync` — instant, derived from the docs, no re-scan."
      );
      break;
    case "corrupt":
      console.log("⚠ CORRUPT — wiki-meta.json exists but is not valid JSON.\n  Fix: `orc wiki sync` rebuilds it from the docs.");
      break;
    case "drifted":
      console.log(
        `⚠ OUT OF SYNC — ${plural(s.added.length, "doc")} not in the manifest, ${plural(s.dropped.length, "stale entry", "stale entries")}.\n` +
          (s.added.length ? `  new:     ${s.added.join(", ")}\n` : "") +
          (s.dropped.length ? `  missing: ${s.dropped.join(", ")}\n` : "") +
          "  Fix: `orc wiki sync`."
      );
      break;
    default: {
      const d = s.meta.scan_commit
        ? gitIn(paths.root, ["rev-list", "--count", `${s.meta.scan_commit}..HEAD`])
        : null;
      const tier = d === null ? "tier unknown" : Number(d) < 10 ? "FRESH" : Number(d) <= 30 ? "AGING" : "STALE";
      // Crosslink surface — tags reported alongside docs (plan v0.24.0 §B4). A
      // documented boundary with zero tags is the user's exact symptom, so name
      // it here rather than let it read as a clean wiki.
      const provided = readCrosslinkProvided(paths).length;
      const { docs } = readWikiDocs(paths.wikiDir);
      const crossline = provided
        ? ` · crosslink tags: ${provided}`
        : countBoundaryRows(docs) > 0
          ? " · crosslink: UNPUBLISHED boundary (run `/orc-wiki crosslink`)"
          : "";
      console.log(`✓ registered — ${s.docs} docs · last_scan ${s.meta.last_scan || "?"} · ${tier}${d === null ? "" : ` (${d}c)`}${crossline}`);
    }
  }
}

// ── Pattern cache (deterministic existence probe) ───────────────────────────
// The pattern cache lives at <claude>/orc/patterns/<lang>-pattern.md, written by
// orc-pattern's codifier. Like the wiki manifest it sits under the HIDDEN
// .claude dir, so a model's ad-hoc find/glob — which may skip dot-dirs or run
// from a subfolder/sandbox CWD — can wrongly report a generated pattern as
// missing. This probe resolves .claude exactly like every other command and is
// the SOURCE OF TRUTH for "does a cached pattern exist", never a fs guess. This
// is the pattern half of skills/_shared/detecting-artifacts.md (wiki half:
// `orc wiki status`).
function patternsDir(claudeDir) {
  return path.join(claudeDir, "orc", "patterns");
}

function listPatternLangs(claudeDir) {
  const dir = patternsDir(claudeDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => (f.endsWith("-pattern.md") ? f.slice(0, -"-pattern.md".length) : null))
    .filter(Boolean)
    .sort();
}

function patternStatus(claudeDir, lang) {
  const langs = listPatternLangs(claudeDir);
  if (lang) {
    const hit = langs.includes(lang);
    // Exit code IS the contract: 0 = cached, 1 = absent — so a gate can branch
    // on it deterministically without parsing prose.
    console.log(
      hit
        ? `✓ cached — ${path.join(patternsDir(claudeDir), lang + "-pattern.md")}`
        : `✗ absent — no ${lang}-pattern.md (run \`/orc-pattern\` in Claude Code to codify it)`
    );
    process.exit(hit ? 0 : 1);
  }
  if (!langs.length) {
    console.log("no cached patterns — run `/orc-pattern` in Claude Code to codify your conventions");
    return;
  }
  console.log(`✓ ${plural(langs.length, "cached pattern")}: ${langs.join(", ")}`);
}

function pattern() {
  if (flag("--global")) {
    console.error("❌ orc pattern is project-scoped — the cache lives in the repo. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["pattern", <sub?>, <lang?>]
  switch (pos[1]) {
    case undefined:
    case "status":
      patternStatus(claudeDir, pos[2]);
      break;
    default:
      console.error(
        `Unknown: orc pattern ${pos[1]}\n` +
          "Usage: orc pattern status [<lang>]   whether a cached code-pattern exists (exit 1 when <lang> absent)"
      );
      process.exit(1);
  }
}

function wiki() {
  if (flag("--global")) {
    console.error("❌ orc wiki is project-scoped — the wiki lives in the repo. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["wiki", <sub?>, ...]
  switch (pos[1]) {
    case "sync":
      wikiSync(claudeDir, { check: flag("--check") });
      break;
    case undefined:
    case "status":
      wikiStatus(claudeDir);
      break;
    default:
      console.error(
        `Unknown: orc wiki ${pos[1]}\n` +
          "Usage: orc wiki status               registration state of the wiki\n" +
          "       orc wiki sync [--check]       rebuild wiki-meta.json + INDEX.md from the docs"
      );
      process.exit(1);
  }
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
    "(user overrides via `orc config`; update-safe)"
  );
}

// ---------------------------------------------------------------------------
// Version + update check. Current version = this package's package.json. Latest
// = the raw package.json on the install source's default branch (that's what
// `orc upgrade` would pull). Cached 24h in ~/.orc-update-check.json, fail-silent
// offline, opt out with ORC_NO_UPDATE_CHECK=1.
// ---------------------------------------------------------------------------

const UPDATE_URL =
  process.env.ORC_VERSION_URL ||
  "https://raw.githubusercontent.com/azure-id/orc/main/package.json";
const CACHE_FILE = path.join(os.homedir(), ".orc-update-check.json");
const CHECK_TTL_MS = 24 * 60 * 60 * 1000;

function currentVersion() {
  try {
    return require(path.join(PKG_ROOT, "package.json")).version || "0.0.0";
  } catch (_) {
    return "0.0.0";
  }
}

function parseSemver(v) {
  const m = String(v).trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function semverGt(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// Zero-dep HTTPS GET → parsed JSON (or null). Bounded timeout, one redirect hop.
function httpsGetJson(url, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const https = require("https");
      const req = https.get(
        url,
        { headers: { "User-Agent": "orc-cli" } },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            httpsGetJson(res.headers.location, timeoutMs).then(done);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            return done(null);
          }
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              done(JSON.parse(data));
            } catch (_) {
              done(null);
            }
          });
        }
      );
      req.on("error", () => done(null));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        done(null);
      });
    } catch (_) {
      done(null);
    }
  });
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch (_) {
    return null;
  }
}
function writeCache(obj) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
  } catch (_) {}
}

const updateCheckDisabled = () =>
  process.env.ORC_NO_UPDATE_CHECK === "1" || process.env.CI === "true";

// Latest version, honoring the 24h cache. force=true ignores the TTL.
async function getLatestVersion({ force }) {
  const cache = readCache();
  const fresh = cache && Date.now() - (cache.checkedAt || 0) < CHECK_TTL_MS;
  if (!force && fresh) return cache.latest || null;
  const pkg = await httpsGetJson(UPDATE_URL, 2000);
  const latest = pkg && pkg.version ? pkg.version : cache ? cache.latest : null;
  writeCache({ checkedAt: Date.now(), latest });
  return latest;
}

// One-line nudge appended to normal commands. Uses the cache (refreshing at most
// once/24h). Never throws, never blocks meaningfully when offline.
async function maybeNudge() {
  if (updateCheckDisabled()) return;
  try {
    const latest = await getLatestVersion({ force: false });
    const cur = currentVersion();
    if (latest && semverGt(latest, cur)) {
      console.log(
        `\n⬆  orc ${latest} is available (you have ${cur}). Run \`orc upgrade\` to update.`
      );
    }
  } catch (_) {}
}

// `orc version` — always live-checks (bounded), so users can force a check.
async function version() {
  const cur = currentVersion();
  console.log(`orc ${cur}`);
  if (updateCheckDisabled()) return;
  const latest = await getLatestVersion({ force: true });
  if (!latest) {
    console.log("(couldn't check for updates — offline or source unreachable)");
  } else if (semverGt(latest, cur)) {
    console.log(`⬆  newer version available: ${latest} — run \`orc upgrade\``);
  } else {
    console.log("✓ up to date");
  }
}

function help() {
  console.log(`orc — install the ORC Claude Code skill constellation

Usage:
  orc init [--global | --dir <path>]      copy skills + commands (skips existing)
  orc update [--global | --dir <path>]    overwrite existing orc files (local copy only)
  orc upgrade [--global | --dir <path>]   fetch the LATEST package, then apply it
                                          [--from <spec>]  (default: ${DEFAULT_INSTALL_SPEC})
  orc config [--global | --dir <path>]    view/change settings (interactive menu)
    orc config list                       print effective config (default vs override)
    orc config set <key> <value>          validate + write one setting
    orc config reset [key]                revert one key (or all) to defaults
    orc config path                       print the override file location
  orc diy [--dir <path>]                  compose your own flow — INTERACTIVE menu (project-scoped; no --global)
    orc diy init [--preset <name>]        create the flow config (presets: lean, paranoid, solo-fast)
    orc diy set <key> <value>             change one flow key (requires recompile)
    orc diy show | validate | status      inspect the flow + gate state
    orc diy compile                       build the runnable flow for /orc-diy
    orc diy reset                         delete the flow (back to UNCONFIGURED)
  orc crosslink [--dir <path>]            compose cross-repo wiki links — INTERACTIVE (project-scoped; no --global)
    orc crosslink list | status           inspect the graph + per-repo freshness (read-only)
    orc crosslink remove <name>           drop a linked repo and its edges
  orc wiki [--dir <path>]                 registration state of the wiki (project-scoped; no --global)
    orc wiki sync [--check]               rebuild wiki-meta.json + INDEX.md from the docs on disk
                                          (instant, no re-scan — this is the repair for an
                                           unregistered wiki, e.g. a scan stopped at a pause)
  orc pattern [--dir <path>]              cached code-patterns (project-scoped; no --global)
    orc pattern status [<lang>]           whether a cached pattern exists — the deterministic
                                          existence probe every knowledge-gated lane runs first
                                          (exit 1 when <lang> absent; no arg lists all cached)
  orc where [--global | --dir <path>]     show target paths
  orc version                             print installed version + check for a newer one
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

(async () => {
  switch (cmd) {
    case "init":
      install({ overwrite: false });
      await maybeNudge();
      break;
    case "update":
      install({ overwrite: true });
      await maybeNudge();
      break;
    case "upgrade":
      upgrade(); // already fetching the latest — no nudge
      break;
    case "config":
      config();
      break;
    case "diy":
      diy();
      break;
    case "crosslink":
      crosslink();
      break;
    case "wiki":
      wiki();
      break;
    case "pattern":
      pattern();
      break;
    case "where":
      where();
      await maybeNudge();
      break;
    case "version":
    case "--version":
    case "-v":
      await version();
      break;
    case "--help":
    case "-h":
    case "help":
    case undefined:
      help();
      await maybeNudge();
      break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      help();
      process.exit(1);
  }
})();
