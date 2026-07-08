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
    if (a === "--dir" || a === "--from") {
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

  // 3) Trace hook — PreToolUse(Task) SPAWN + SubagentStop RETURN skeleton.
  //    Idempotent; non-destructive. The hook self-gates (writes ONLY when
  //    logging:true AND a run pointer exists), so wiring it is always safe.
  const traceCmd = nodeCmd(path.join(hooksDest, "orc-trace.js"));
  const wireTrace = (arrName, matcher) => {
    settings.hooks[arrName] = settings.hooks[arrName] || [];
    let found = false;
    for (const entry of settings.hooks[arrName]) {
      for (const h of entry.hooks || []) {
        if (typeof h.command === "string" && h.command.includes("orc-trace")) {
          h.command = traceCmd; // keep the path current on update
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
      console.log(`  upd   settings.json → ${arrName} trace hook path`);
    }
  };
  wireTrace("PreToolUse", "Task");
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

  console.log(`\nInstalled into ${claudeDir}`);
  console.log(
    "Slash commands: /orc  /orc-mini  /orc-analyze  /orc-plan  /orc-verify  /orc-wiki"
  );
  console.log("Config: run `orc config` (CLI, interactive) — not a slash command.");
  console.log("\nNext:");
  console.log("  • Paste your PR template into skills/orc/subskills/orc-pr/pr.md");
  console.log("  • Add to your .gitignore:  .claude/skills/orc/run/");
  console.log("  • If a /command doesn't appear, your Claude Code may read commands");
  console.log("    from a different folder — move the files in commands/ there.");
  console.log("  • Run /agents to confirm the agent model IDs your CLI accepts,");
  console.log("    and run your MAIN session on Opus (see agents/MODEL-MAPPING.md).");
  console.log("  • A PreToolUse guard now HARD-BLOCKS /orc unless the session is at");
  console.log("    high effort; the statusline warns when the model isn't Opus 4.8.");
  console.log("  • Behavior-trace logging is OFF by default. To capture run traces");
  console.log("    for skill review: `orc config set logging true` (writes .claude/orc/logs/).");
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
  { key: "logging", def: false, tier: "common", validate: vEnum("true", "false"), options: ["true", "false"], desc: "Write a persistent behavior trace per run (OFF by default; for skill-improvement review)." },
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
      // Common keys carry an `options` list (a friendly enum). Show the allowed
      // values inline and let the user type one directly — no index ambiguity.
      // A raw value outside the list is still accepted if `validate` passes.
      if (m.options) console.log(`  options: ${m.options.join(" | ")}`);
      const prompt = m.options
        ? `  type a value (blank = keep): `
        : `  new value (blank = keep): `;
      const nv = (await ask(prompt)).trim();
      if (!nv) {
        console.log("  (unchanged)");
        continue;
      }
      const res = m.validate(nv);
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
