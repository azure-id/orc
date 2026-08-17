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
const ui = require("./ui.js");
const { SECTIONS: ONBOARDING } = require("./onboarding-content.js");

// Where `orc upgrade` fetches a fresh package from. Override with --from <spec>
// or ORC_INSTALL_SPEC (e.g. a fork, a tarball URL, or "orc" for the npm registry
// once published). By default the tarball is tried FIRST (straight HTTPS, works
// everywhere), the github: spec second — the github: spec shells out to git and
// fails on machines with restricted git / NVM quirks, so leading with it burnt a
// guaranteed failure + npm error wall on every upgrade.
const GITHUB_SPEC = "github:azure-id/orc";

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

// ── Machine-readable output (v0.43.0) ──────────────────────────────────────
// One rule, enforced by test/cli.test.js for every flagged command: `--json`
// prints EXACTLY ONE object to stdout, nothing else — no banner, no colour, no
// update nudge — and keeps the exit code the human path would have used. The
// exit codes are already a contract (`pattern status`, `diy status`, `resume`,
// `wiki impact`), so the flag changes rendering only, never semantics. `orc ui`
// is the first consumer, but the flags stand on their own: they make the whole
// CLI scriptable.
const wantsJson = () => flag("--json") === true;

// Print the object and (optionally) exit with the human path's code.
function emitJson(obj, exitCode) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  if (exitCode !== undefined) process.exit(exitCode);
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

// ── Install manifest + orphan pruning (B1) ─────────────────────────────────
// `install()` records ORC's exact footprint in .claude/orc/install-manifest.json
// so a later `orc update` can DELETE files that left templates/ (e.g. a renamed
// agent). Pruning is bounded to paths ORC itself installed — user files,
// patterns, wiki, configs, run folders are never touched.
const MANIFEST_REL = "orc/install-manifest.json";

// Every file under srcRoot as a POSIX path relative to srcRoot.
function listSrcRel(srcRoot) {
  const out = [];
  const rec = (d, base) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = (base ? base + "/" : "") + e.name;
      if (e.isDirectory()) rec(path.join(d, e.name), rel);
      else out.push(rel);
    }
  };
  if (fs.existsSync(srcRoot)) rec(srcRoot, "");
  return out;
}

// The set of claudeDir-relative paths THIS version of ORC ships. Deterministic
// from templates/ (plus the generated hooks/orc-version.json), independent of
// what a given install skipped.
function shippedFootprint() {
  const files = [];
  for (const rel of listSrcRel(SRC_SKILLS)) files.push("skills/" + rel);
  for (const rel of listSrcRel(SRC_COMMANDS)) files.push("commands/" + rel);
  for (const rel of listSrcRel(SRC_AGENTS)) files.push("agents/" + rel);
  for (const rel of listSrcRel(SRC_HOOKS)) files.push("hooks/" + rel);
  files.push("hooks/orc-version.json"); // generated by installGuards, ORC-owned
  return files;
}

function readManifest(claudeDir) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(claudeDir, MANIFEST_REL), "utf8"));
    if (m && Array.isArray(m.files)) return m;
  } catch (_) {}
  return null;
}

function writeManifest(claudeDir, files) {
  fs.mkdirSync(path.join(claudeDir, "orc"), { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, MANIFEST_REL),
    JSON.stringify(
      { version: currentVersion(), files: files.slice().sort() },
      null,
      2
    ) + "\n"
  );
}

// Only paths ORC plants (the four payload trees) are ever prunable — a defence
// in depth on top of "was in the previous manifest". Everything under
// .claude/orc/ is therefore permanently safe from the prune by construction:
// patterns/, gotchas.md, the wiki manifest, run folders, logs/, the install
// manifest itself, and — since v0.43.0 — ui.lock, the `orc ui` server's lock
// file. A prune that deleted a live server's lock would orphan a running write
// surface with no way left to find or stop it.
function isPrunable(rel) {
  return /^(skills|commands|agents|hooks)\//.test(rel);
}

// ── Run state (C1) ─────────────────────────────────────────────────────────
// Mutable run state must NOT live under a payload tree the installer replaces.
// It lives beside the other update-surviving artifacts (patterns/, logs/,
// wiki-meta.json, install-manifest.json) in .claude/orc/ — which `isPrunable`
// can never match. Pre-v0.34.1 installs kept it at .claude/skills/orc/run/,
// where every `orc update` (and `orc doctor --fix`) destroyed it.
const RUN_DIR_DEFAULT = ".claude/orc/run";
// /orc-doc's folder (v0.48.0). Declared HERE, above CONFIG_META, because the
// config default reads it — and held as ONE whole relative literal (the
// CHALLENGE_DIR precedent) so it can be a registered contract token: a rename on
// either side then fails the lint, which two assembled halves would not.
const DOC_DIR = "orc/orc-doc/";
const DOC_DIR_DEFAULT = DOC_DIR.replace(/\/$/, "");
const LEGACY_RUN_REL = "skills/orc/run";
const RUN_GITIGNORE = "# ORC run artifacts — never commit\n*\n!.gitignore\n";

// Absolute run root for this install. `run_dir` is project-relative (like
// log_dir), so it resolves against the project root — claudeDir's parent.
function resolveRunDir(claudeDir) {
  let rel = RUN_DIR_DEFAULT;
  try {
    rel = readOverride(claudeDir).map.run_dir || RUN_DIR_DEFAULT;
  } catch (_) {}
  return path.isAbsolute(rel) ? rel : path.join(claudeDir, "..", rel);
}

function ensureRunDir(claudeDir) {
  const dir = resolveRunDir(claudeDir);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const gi = path.join(dir, ".gitignore");
    if (!fs.existsSync(gi)) fs.writeFileSync(gi, RUN_GITIGNORE);
  } catch (_) {}
  return dir;
}

// Move run state out of the legacy location BEFORE the skill copy runs, so the
// very update that fixes this bug is not the one that loses a mid-run
// checkpoint. Never overwrites state already migrated; leaves the marker files.
function migrateRunState(claudeDir) {
  const legacy = path.join(claudeDir, LEGACY_RUN_REL);
  if (!fs.existsSync(legacy)) return;
  let entries;
  try {
    entries = fs.readdirSync(legacy).filter((n) => n !== ".gitignore" && n !== ".npmignore");
  } catch (_) {
    return;
  }
  if (!entries.length) return;
  const dest = ensureRunDir(claudeDir);
  let moved = 0;
  for (const name of entries) {
    const from = path.join(legacy, name);
    const to = path.join(dest, name);
    if (fs.existsSync(to)) continue; // already migrated — never clobber
    try {
      fs.renameSync(from, to);
      moved++;
    } catch (_) {
      // cross-device or locked: copy then remove
      try {
        if (fs.statSync(from).isDirectory()) copyDir(from, to);
        else fs.copyFileSync(from, to);
        fs.rmSync(from, { recursive: true, force: true });
        moved++;
      } catch (_) {}
    }
  }
  if (moved)
    console.log(
      `  move  ${moved} run folder(s) skills/orc/run/ → ${RUN_DIR_DEFAULT.replace(/^\.claude\//, "")}/ (run state now survives updates)`
    );
}

// Remove now-empty directories left behind by pruned files, deepest-first,
// never touching the four top-level payload roots themselves.
function removeEmptyDirs(claudeDir, rels) {
  const dirs = new Set();
  for (const rel of rels) {
    let d = path.posix.dirname(rel);
    while (d && d !== "." && d !== "/") {
      dirs.add(d);
      d = path.posix.dirname(d);
    }
  }
  const roots = new Set(["skills", "commands", "agents", "hooks"]);
  for (const rel of [...dirs].sort((a, b) => b.length - a.length)) {
    if (roots.has(rel)) continue;
    const abs = path.join(claudeDir, rel);
    try {
      if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
    } catch (_) {}
  }
}

// Pre-manifest installs (upgraded from a version before B1) have no proof of
// what ORC owns, so NEVER auto-delete: detect clearly ORC-named orphans and
// require an explicit `orc update --prune`.
function detectPreManifestOrphans(claudeDir, current) {
  const out = [];
  const consider = (sub, re) => {
    const d = path.join(claudeDir, sub);
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d)) {
      if (!re.test(name)) continue;
      const rel = sub + "/" + name;
      if ([...current].some((c) => c === rel || c.startsWith(rel + "/"))) continue;
      const abs = path.join(d, name);
      try {
        if (fs.statSync(abs).isDirectory()) {
          for (const f of listSrcRel(abs)) out.push(rel + "/" + f);
        } else out.push(rel);
      } catch (_) {}
    }
  };
  consider("agents", /^orc.*\.md$/i);
  consider("commands", /^orc.*\.md$/i);
  consider("skills", /^orc/i);
  return out;
}

function deletePaths(claudeDir, rels, label) {
  let n = 0;
  for (const rel of rels) {
    if (!isPrunable(rel)) continue;
    const abs = path.join(claudeDir, rel);
    try {
      if (fs.existsSync(abs)) {
        fs.rmSync(abs, { force: true });
        console.log(`  del   ${rel}`);
        n++;
      }
    } catch (_) {}
  }
  removeEmptyDirs(claudeDir, rels);
  if (n) console.log(`\n  pruned ${n} orphaned file(s) ${label}.`);
  return n;
}

// Delete files ORC used to ship but no longer does. Auto-prunes only what a
// previous manifest proves ORC owned; otherwise gated behind --prune.
function pruneOrphans(claudeDir, footprint, prevManifest, forcePrune) {
  const current = new Set(footprint);
  if (prevManifest) {
    const orphans = prevManifest.files.filter((f) => !current.has(f) && isPrunable(f));
    if (orphans.length) {
      deletePaths(
        claudeDir,
        orphans,
        `that left ORC's payload since ${prevManifest.version || "the last install"}`
      );
    }
    // NO early return (C3). Never DELETING an unowned file is correct — but the
    // old `return` also suppressed the candidate REPORT, so after the first
    // manifested install a user was never told a file looks orphaned and
    // `orc update --prune`'s documented purpose became unreachable. Fall
    // through: always report, still delete only under --prune.
  }
  const candidates = detectPreManifestOrphans(claudeDir, current);
  if (!candidates.length) return;
  if (forcePrune || flag("--prune") === true) {
    deletePaths(claudeDir, candidates, "(ORC-named files absent from this payload)");
  } else {
    console.log("\n  ⚠  possible orphaned ORC files (no manifest proves ORC owns them):");
    for (const rel of candidates) console.log("       " + rel);
    console.log("     They are ORC-named but not in the current payload. Remove with:");
    console.log("       orc update --prune");
  }
}

function install({ overwrite, forcePrune }) {
  const claudeDir = resolveClaudeDir();
  const skillsDest = path.join(claudeDir, "skills");
  const commandsDest = path.join(claudeDir, "commands");
  const agentsDest = path.join(claudeDir, "agents");

  // Read the PREVIOUS footprint before we overwrite anything, so update can
  // diff it against the new payload and prune what left.
  const prevManifest = readManifest(claudeDir);

  // C1 — relocate mutable run state BEFORE any skill directory is touched.
  migrateRunState(claudeDir);
  ensureRunDir(claudeDir);

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
    // C2 — child-by-child overwrite, never a recursive rm of a user-writable
    // tree. C1 moved the state we know about; this makes the installer safe for
    // the state a future feature might write into a skill folder. Removing a
    // file that LEFT the payload stays the manifest prune's job (below), which
    // deletes only paths a previous manifest proves ORC owned.
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

  // Record ORC's footprint, then (on update only) prune files that left the
  // payload. A fresh init has nothing to prune; update diffs against the
  // manifest read before copying.
  const footprint = shippedFootprint();
  if (overwrite) pruneOrphans(claudeDir, footprint, prevManifest, forcePrune);
  writeManifest(claudeDir, footprint);

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
  console.log("  • Add to your .gitignore:  .claude/orc/run/");
  console.log("  • If a /command doesn't appear, your Claude Code may read commands");
  console.log("    from a different folder — move the files in commands/ there.");
  console.log("  • Run /agents to confirm the agent model IDs your CLI accepts,");
  console.log("    and run your MAIN session on Opus (see agents/MODEL-MAPPING.md).");
  console.log("  • A PreToolUse guard now HARD-BLOCKS /orc unless the session is at");
  console.log("    high effort; the statusline warns when the model isn't Opus 4.8.");
  console.log("  • Behavior-trace logging is ALWAYS ON (permanent) — every ORC run");
  console.log("    writes a persistent trace under .claude/orc/logs/ (set log_dir to move it).");
  console.log("\n" + ui.color.bold("New to ORC? Run `orc onboarding`") + " — the full walkthrough, no GitHub README needed.");
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

// Try `npm install -g <spec>`; return { ok, output }. Captures stdio (pipe)
// instead of inheriting it, so a failed probe with a remaining fallback stays
// quiet — the loud npm error wall is only shown if EVERY spec fails.
function npmInstallGlobal(spec) {
  console.log("  → npm install -g " + spec);
  const r = spawnSync(`npm install -g ${spec}`, { shell: true, encoding: "utf8" });
  return { ok: r.status === 0, output: (r.stdout || "") + (r.stderr || "") };
}

// last_good_spec — remember which source actually installed, in the same 24h
// update-cache file orc-update-lib.js owns (~/.orc-update-check.json). The next
// upgrade tries it first. Fail-silent: an unreadable/absent cache just means no
// remembered spec (we fall back to the tarball-first default order).
function readLastGoodSpec() {
  try {
    const c = readCache();
    return c && typeof c.last_good_spec === "string" ? c.last_good_spec : null;
  } catch (_) {
    return null;
  }
}
function writeLastGoodSpec(spec) {
  try {
    const c = readCache() || {};
    c.last_good_spec = spec;
    writeCache(c);
  } catch (_) {}
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
  // Specs to try in order. `--from` and ORC_INSTALL_SPEC still win OUTRIGHT
  // (single spec, no fallback). Otherwise: the remembered last_good_spec first
  // (if any), then the tarball (straight HTTPS — works everywhere), then the
  // github: spec last. Deduped so a remembered tarball doesn't retry twice.
  let specs;
  if (fromFlag) specs = [fromFlag];
  else if (process.env.ORC_INSTALL_SPEC) specs = [process.env.ORC_INSTALL_SPEC];
  else {
    const remembered = readLastGoodSpec();
    specs = [...new Set([...(remembered ? [remembered] : []), TARBALL_SPEC, GITHUB_SPEC])];
  }

  console.log("\norc upgrade — fetching the latest package, then applying it.");
  console.log("  step 1/2: refresh the global orc package");

  let installed = false;
  let lastOutput = "";
  for (let i = 0; i < specs.length; i++) {
    const res = npmInstallGlobal(specs[i]);
    if (res.ok) {
      installed = true;
      writeLastGoodSpec(specs[i]);
      break;
    }
    lastOutput = res.output;
    if (i < specs.length - 1) {
      console.log("  ⚠  that source failed — trying the next source…");
    }
  }
  if (!installed) {
    const tflags = targetFlags();
    // Every spec failed — NOW show npm's captured output (from the last attempt)
    // so the user has the real error, without the wall on every intermediate try.
    if (lastOutput.trim()) {
      console.error("\n  npm output from the final attempt:\n" + lastOutput.trim());
    }
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
        "\n   If it still fails, install directly then apply:\n" +
        `     npm i -g ${TARBALL_SPEC}  &&  orc update` +
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
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-fable-5",
];

// Every validator carries a `kind` tag (plus its bounds/choices). Nothing in the
// terminal path reads it — it exists so `orc config list --json` can describe
// each key's CONTROL to a non-terminal caller without a second table to drift.
// The validator IS the source of truth for what a value may be, so the control
// description is derived from it rather than re-declared.
const tag = (fn, meta) => Object.assign(fn, meta);

const vInt = (min) =>
  tag((raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) return { err: `must be an integer >= ${min}` };
    return { value: n };
  }, { kind: "int", min });
const vRange = (min, max) =>
  tag((raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max)
      return { err: `must be an integer ${min}-${max}` };
    return { value: n };
  }, { kind: "range", min, max });
const vEnum = (...opts) =>
  tag(
    (raw) => (opts.includes(raw) ? { value: raw } : { err: `must be one of: ${opts.join(", ")}` }),
    { kind: "enum", choices: opts }
  );
const vModel = tag((raw) => {
  if (!KNOWN_MODELS.includes(raw))
    return { err: `unknown model id (expected one of: ${KNOWN_MODELS.join(", ")})` };
  // Opus 4.8 is the baseline; Fable 5 is strictly capable (never downgrades a
  // subagent). Anything else is below the tier ladder and warns.
  const warn =
    raw.startsWith("claude-opus") || raw === "claude-fable-5"
      ? null
      : "⚠ below Opus/Fable — every opus-* agent silently falls back to a smaller model (tier ladder).";
  return { value: raw, warn };
}, { kind: "enum", choices: KNOWN_MODELS });
const vPath = tag(
  (raw) => (raw && raw.trim() ? { value: raw } : { err: "must be a non-empty path" }),
  { kind: "path" }
);
// A short free-text value with a SUGGESTED pick-list rather than a closed one —
// a language tag is not an enum ORC gets to decide, so the menu guides without
// locking anybody out of the language they actually write in.
const vText = tag(
  (raw) => (raw && String(raw).trim() ? { value: String(raw).trim() } : { err: "must be a non-empty value" }),
  { kind: "text" }
);
// GitHub delivery target for /orc-retro — owner/repo, nothing else.
const vRepo = tag(
  (raw) =>
    /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(String(raw).trim())
      ? { value: String(raw).trim() }
      : { err: "must be a GitHub owner/repo (e.g. azure-id/orc)" },
  { kind: "repo" }
);

// Fable 5 role override (C.1). Roles that MAY be handed to a Fable 5 agent.
const FABLE5_ROLES = ["analyze", "plan", "advisor", "judge", "review"];
// CSV (or bracketed) subset validator → a normalized flow-array string
// (`[analyze, plan]`), which serializeValue passes through as valid YAML.
const vSubset = (allowed) =>
  tag((raw) => {
    const items = String(raw)
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const bad = items.filter((x) => !allowed.includes(x));
    if (bad.length)
      return { err: `unknown role(s): ${bad.join(", ")} (allowed: ${allowed.join(", ")})` };
    return { value: `[${[...new Set(items)].join(", ")}]` };
  }, { kind: "subset", choices: allowed });

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
  { key: "gotchas", def: "on", tier: "common", validate: vEnum("on", "off"), options: ["on", "off"], desc: "Repair memory: record a gotcha when a repair loop goes red → green, and inject the scope-matching ones into executor slices. Never injected unfiltered; see .claude/orc/gotchas.md." },
  { key: "gotchas_max", def: 40, tier: "common", validate: vInt(5), options: [20, 40, 60, 100], desc: "Live gotcha entries kept before the lowest-value tail is archived to gotchas-archive.md (never deleted)." },
  { key: "security_review", def: "off", tier: "common", validate: vEnum("off", "ask", "on"), options: ["off", "ask", "on"], desc: "Opt-in Phase 5.5 security pass on runs with a task scored >= 70 (risk floor). OFF by default." },
  { key: "run_budget_dispatches", def: 0, tier: "common", validate: vInt(0), options: [0, 8, 12, 20, 30], desc: "Subagent budget for one run. The Phase-1 forecast estimates how many subagents the run will dispatch; if that exceeds this number the run STOPS before wave 1 (a hard gate like the batch pause, not a hint) and offers proceed / a cheaper lane / re-plan smaller. 0 = off, nothing changes." },
  { key: "mock_example", def: "ask", tier: "common", validate: vEnum("ask", "on", "off"), options: ["ask", "on", "off"], desc: "Post-verify mocked runnable example (mock-examples/<slug>/, never committed): ask = offer after a green verify, on = always, off = never." },
  { key: "tdd_loop_max", def: 3, tier: "common", validate: vInt(1), options: [1, 2, 3, 4, 5], desc: "Max implement→test→repair iterations per task in the TDD gate; cap hit → STOP SEQUENCE + honest red report." },
  { key: "stacked_pr", def: "ask", tier: "common", validate: vEnum("ask", "on", "off"), options: ["ask", "on", "off"], desc: "Phase 8 stacked-PR gate (full /orc + /orc-ultra only): ask = ONE P0 question when the change trips the threshold below, on = take yes without asking, off = always one regular PR. Yes needs a ticket AND a resolved PR template, else it degrades to a regular PR. Hands off to /orc-pr-setup → /orc-pr-driver; never fires in orc-mini/orc-fast/orc-diy." },
  { key: "stacked_pr_loc", def: 1000, tier: "common", validate: vInt(1), options: [500, 800, 1000, 1500, 2000], desc: "Change LoC (additions+deletions, exclusions applied) >= this trips the stacked-PR gate — and is ALSO the per-layer LoC ceiling: a change that cannot fit in one layer's budget is what is worth stacking." },
  { key: "stacked_pr_files", def: 20, tier: "common", validate: vInt(1), options: [10, 15, 20, 30, 40], desc: "Changed-file count >= this trips the stacked-PR gate; also the per-layer hard max (soft target = half of it)." },
  { key: "stacked_pr_max_layers", def: 6, tier: "common", validate: vInt(2), options: [4, 5, 6, 8, 10], desc: "Soft cap on layers per stack: <= cap proceed, cap+1..cap+2 warn + explicit override, beyond → STOP (multiple stacks or a phased release). N layers = N full CI runs." },
  { key: "opus5_only", def: false, tier: "common", validate: vEnum("true", "false"), options: ["true", "false"], desc: "EVERY dispatched role uses ONE model — Opus 5 — with EFFORT as the cost dial (executors: [0,40) low · [40,80) medium · [80,100] high; each fixed role its own pinned effort). Deep SWE-benchmark work on cost vs efficiency across Claude models finds a single Opus 5 agent with the effort ladder the most efficient setup. It FORCES: while on it outranks fable5_* and a hand-written rubric_bands_override. Needs an Opus 5 main session or EVERY dispatch silently downgrades. Excludes the Haiku trace writer and orc-diy (compile-owned)." },
  // --- v0.46.0 — the six new lanes ------------------------------------------
  { key: "pact_gate", def: "warn", tier: "common", validate: vEnum("off", "warn"), options: ["off", "warn"], desc: "Invariant ledger at Phase 1 + planning: warn = print the one pact line and inject a DRIFTED/BROKEN promise whose anchors intersect the plan's declared files as a planner constraint; off = nothing. NEVER blocks — a promise is advice with a receipt, not a gate. See /orc-pact." },
  { key: "pact_recheck_on_verify", def: "true", tier: "common", validate: vEnum("true", "false"), options: ["true", "false"], desc: "Phase 6: re-run the cheap checks for ONLY the invariants the change touched (`orc pact check`), so a promise that just leaked is caught in the run that broke it." },
  { key: "boundary_gate", def: "warn", tier: "common", validate: vEnum("off", "warn", "block"), options: ["off", "warn", "block"], desc: "Boundary verdicts at dispatch: warn = print the counts and the per-task verdict, off = ignore the cards, block = a REFUSE task is LIFTED OUT of its wave (the wave proceeds) and handed back with its checklist. `block` changes dispatch behaviour, which is why the default is warn. It gates ORC's own dispatch, never an explicit instruction from you." },
  { key: "handoff_write", def: "true", tier: "common", validate: vEnum("true", "false"), options: ["true", "false"], desc: "Whether `orc handoff set` (and the Self-serve panel) may write a graded surface. false = MAP-ONLY, for teams that want no browser writes at all. A RED surface is never written either way." },
  { key: "budget_min_samples", def: 5, tier: "common", validate: vInt(1), options: [3, 5, 8, 12], desc: "Dispatches a band needs before /orc-budget calls its forecast confident. Below it the band is printed as low-confidence — a forecast is a range WITH a sample count, never one number." },
  { key: "budget_units", def: "auto", tier: "common", validate: vEnum("auto", "tokens", "usd", "quota", "all"), options: ["auto", "tokens", "usd", "quota", "all"], desc: "Primary unit for a forecast. auto picks from budget_plan: a Pro/Max user burns a session window, not dollars, so `$7.02` means nothing to them and `18% of your 5-hour window` means everything. Tokens are always available." },
  { key: "budget_plan", def: "auto", tier: "common", validate: vEnum("auto", "pro", "max5", "max20", "api"), options: ["auto", "pro", "max5", "max20", "api"], desc: "Which Claude plan you are on, for the quota view. There is no reliable local signal for this, so it is ASKED ONCE at the first forecast and stored — never a wrong guess rendered as a percentage. api = billed per token, so USD is the primary unit." },
  { key: "budget_price_table", def: "", tier: "advanced", validate: vPath, desc: "Path to your own dated price table (default: the shipped bin/pricing.json). A table older than 90 days prints a staleness warning beside every dollar figure." },
  { key: "aftermath_window_days", def: 30, tier: "advanced", validate: vInt(1), desc: "How far back /orc-aftermath grades. A run younger than 7 days is `too recent to grade` — an answer, not a gap." },
  // --- v0.47.0 — /orc-challenge ---------------------------------------------
  { key: "challenge_pass_severity", def: "p1", tier: "common", validate: vEnum("p0", "p1", "p2"), options: ["p0", "p1", "p2"], desc: "The severity at or above which an open finding BLOCKS a pass. PASS is computed, never declared: the judge reports findings and `orc challenge record` decides, which removes leniency as a possibility — a judge can only find, or fail to find. Accepted exceptions are subtracted first." },
  { key: "challenge_stall_after", def: 3, tier: "common", validate: vInt(2), options: [2, 3, 4, 5], desc: "Iterations with no net reduction in blocking findings before a cycle is flagged `stalled`. A FLAG, never a cap: each turn of this loop is a separate human sitting down to work, so refusing on iteration 6 would be refusing to review a hard document. It reports honestly and offers three options instead." },
  { key: "challenge_reader", def: "on", tier: "common", validate: vEnum("on", "off"), options: ["on", "off"], desc: "The COLD READ dispatch that measures D4 (can a reader with no prior context follow this?). A grounded judge structurally cannot answer that — it has read the repo and will fill every gap the document leaves. off → D4 reports NOT-CHECKED with that reason, never silently." },
  { key: "challenge_gate", def: "warn", tier: "common", validate: vEnum("off", "warn"), options: ["off", "warn"], desc: "Whether /orc's Phase-1 preflight prints one line when the document it is about to build from has an in-flight, failing challenge cycle. There is deliberately NO `block` — the /orc-pact precedent: the payoff is knowing, not gating." },
  // --- v0.48.0 — /orc-doc ----------------------------------------------------
  { key: "doc_max_lines_per_agent", def: 400, tier: "common", validate: vInt(40), options: [200, 400, 600, 800], desc: "Write/read budget per dispatched /orc-doc agent, in lines. It is what turns a 10,000-line document into ~25 slices the orchestrator never reads: a writer is given its own part file and a checker is given a line RANGE. A section is NEVER split to fit — a single section over this cap is reported as a planning smell and offered as a split at the outline gate instead." },
  { key: "doc_max_parallel", def: 2, tier: "common", validate: vInt(1), options: [1, 2], desc: "Agents per /orc-doc wave. HARD CAP 2 — a larger value is clamped and the clamp is announced, because more parallel writers is more chances for the outline to drift and the compile is what has to reconcile them. Each agent owns exactly ONE file under sections/, so no two ever share one." },
  { key: "doc_write_mode", def: "ask", tier: "common", validate: vEnum("ask", "partial", "all"), options: ["ask", "partial", "all"], desc: "How much of a /orc-doc document is bought at once. `partial` writes ONE wave, then stops so you can read those section files and redirect before the rest is paid for — the single biggest saving in the lane. `all` writes every wave. `ask` (default) makes it a question asked once per run and stored, so the choice is yours and never the model's to remember." },
  { key: "doc_language", def: "en", tier: "common", validate: vText, options: ["en", "id", "es", "de", "fr", "ja"], desc: "Default output language for /orc-doc, always confirmable per run. A non-English document is held to the SAME plain-language bar in that language — short sentences, common words, acronyms expanded; technical terms with no natural translation stay in English and are glossed once." },
  { key: "doc_dir", def: DOC_DIR_DEFAULT, tier: "advanced", validate: vPath, desc: "Where /orc-doc folders live. Project root, not .claude/ — a document is a deliverable a human opens, and the same call /orc-quick, /orc-brainstorm and poly-repo-implementation/ already made." },
  { key: "wiki_scan_tier", def: "ladder", tier: "advanced", validate: vEnum("ladder", "always_deep"), desc: "Wiki scan tier: ladder picks light/deep per delta (first scan, STRUCTURAL, wide delta or a new exported symbol → deep; otherwise light), always_deep restores pre-v0.46.0 behaviour. The resolved tier is always printed — a cheaper model is never a quiet substitution." },
  { key: "wiki_tier_deep_files", def: 3, tier: "advanced", validate: vInt(1), desc: "Covered files touched at or above this count send the refresh to the DEEP scanner." },
  { key: "wiki_refresh_budget", def: 0, tier: "advanced", validate: vInt(0), desc: "Max scan-tasks per refresh run; 0 = no cap. A capped refresh is a PLANNED stop, not an interrupt: sync has already run, so the wiki is registered and consistent, and the remaining docs are AGING, not broken. Separate from the fixed pause-every-5 rule — do not merge them." },
  { key: "wiki_retire_after_runs", def: 0, tier: "advanced", validate: vInt(0), desc: "Offer to retire a doc no run put into a slice in this many runs (0 = never offer). Retiring MOVES it to wiki/retired/ and drops it from INDEX.md — reversible, never a delete." },
  // --- Fable 5 role override (HARD-GATED: nothing changes unless enabled: true) ---
  { key: "fable5_enabled", def: false, tier: "fable5", validate: vEnum("true", "false"), options: ["true", "false"], desc: "Master gate — route selected roles to Fable 5 agents. Nothing changes unless true." },
  { key: "fable5_effort", def: "medium", tier: "fable5", validate: vEnum("medium", "high", "xhigh", "max"), options: ["medium", "high", "xhigh", "max"], desc: "Effort for the Fable 5 role agents (the CLI rewrites their effort: frontmatter on set)." },
  { key: "fable5_roles", def: "[]", tier: "fable5", validate: vSubset(FABLE5_ROLES), options: FABLE5_ROLES, desc: "Which roles use Fable 5 (CSV): analyze, plan, advisor, judge, review. Empty = no effect." },
  // NOTE: behavior-trace logging is PERMANENT (always on) and intentionally NOT
  // a config key — the orc-trace.js hook always writes a persistent trace per
  // run under log_dir. Only the folder location (log_dir) is configurable.
  { key: "orc_wiki_pattern_findings", def: false, tier: "advanced", validate: vEnum("true", "false"), desc: "orc-wiki also codifies ALL detected languages during its scan (pre-warms the pattern cache)." },
  { key: "crosslink_fresh_days", def: 10, tier: "advanced", validate: vInt(1), desc: "Cross-repo crosslink snapshot: days since sync ≤ this → FRESH hint (Signal B; advisory)." },
  { key: "crosslink_aging_days", def: 15, tier: "advanced", validate: vInt(1), desc: "Cross-repo crosslink snapshot: days since sync ≤ this → AGING; beyond → STALE (advisory, never blocks)." },
  { key: "wiki_delta_full_threshold", def: 30, tier: "advanced", validate: vRange(1, 100), desc: "Wiki delta refresh: TOUCHED docs above this percent of registered docs → `orc wiki impact` recommends a FULL refresh (user decides)." },
  { key: "wiki_fresh_max", def: 10, tier: "advanced", validate: vInt(1), desc: "Wiki freshness: commit distance < this → FRESH (computed on read, never stored)." },
  { key: "wiki_aging_max", def: 30, tier: "advanced", validate: vInt(1), desc: "Wiki freshness: commit distance <= this → AGING; beyond → STALE." },
  { key: "wiki_refresh_ask_tasks", def: 3, tier: "advanced", validate: vInt(1), desc: "Post-ship wiki refresh ask fires when the run's task count >= this." },
  { key: "wiki_refresh_ask_files", def: 10, tier: "advanced", validate: vInt(1), desc: "…or when the run's touched-file count exceeds this (full/ultra lanes)." },
  { key: "retro_repo", def: "azure-id/orc", tier: "advanced", validate: vRepo, desc: "GitHub owner/repo that receives /orc-retro reports (PR preferred, issue fallback)." },
  { key: "log_dir", def: ".claude/orc/logs", tier: "advanced", validate: vPath, desc: "Persistent trace folder (never auto-deleted)." },
  { key: "run_dir", def: RUN_DIR_DEFAULT, tier: "advanced", validate: vPath, desc: "Run artifact root (checkpoints/state-of-play) — outside the installer's blast radius." },
  { key: "analyzer_dir", def: ".claude/skills/orc/analyzer", tier: "advanced", validate: vPath, desc: "Internal analyst artifact dir." },
  { key: "planner_dir", def: ".claude/skills/orc/planner", tier: "advanced", validate: vPath, desc: "Internal planner artifact dir." },
  { key: "report_out_dir", def: "analyst_report", tier: "advanced", validate: vPath, desc: "Project-root copy target on report-only." },
  { key: "orchestrator_model", def: "claude-opus-4-8", tier: "advanced", validate: vModel, desc: "Main-session model (below Opus breaks the tier ladder)." },
];
const metaFor = (key) => CONFIG_META.find((m) => m.key === key);
const overridePath = (claudeDir) => path.join(claudeDir, "orc.config.yaml");

// Renamed keys. A key that changes NAME between releases would otherwise revert
// a user's setting silently on upgrade (the old line stays in the file and
// nothing reads it), so an old name is resolved to the new one on read and on
// set. Deliberately NOT in CONFIG_META — the config-key coverage lint requires
// every CONFIG_META key to be referenced under templates/skills/, and a retired
// name is referenced nowhere by design.
const LEGACY_KEYS = {
  opus5_executor_only: "opus5_only", // v0.36.0 — widened from executors to every role
};

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
      const k0 = t.slice(0, i).trim();
      const k = LEGACY_KEYS[k0] || k0;
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      // A retired name never overwrites an explicit new-name line.
      if (k !== k0 && Object.prototype.hasOwnProperty.call(map, k)) continue;
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

// The 5 Fable 5 role-override agents. Effort is written by the CLI (not
// build-agents): `orc config set fable5_effort X` rewrites the `effort:`
// frontmatter line in each INSTALLED copy, deterministically.
const FABLE5_AGENTS = [
  "orc-analyst-fable-5",
  "orc-planner-fable-5",
  "orc-advisor-fable-5",
  "orc-judge-fable-5",
  "orc-reviewer-fable-5",
];
function applyFable5Effort(claudeDir, effort) {
  const dir = path.join(claudeDir, "agents");
  let n = 0;
  for (const name of FABLE5_AGENTS) {
    const f = path.join(dir, name + ".md");
    if (!fs.existsSync(f)) continue;
    try {
      const text = fs.readFileSync(f, "utf8");
      const next = text.replace(/^effort:.*$/m, `effort: ${effort}`);
      if (next !== text) {
        fs.writeFileSync(f, next);
        n++;
      }
    } catch (_) {}
  }
  return n;
}
// Cross-field sanity: enabled but no roles selected does nothing.
function fable5Warn(claudeDir) {
  const { map } = readOverride(claudeDir);
  const enabled = String(map.fable5_enabled) === "true";
  const roles = String(map.fable5_roles || metaFor("fable5_roles").def)
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (enabled && !roles.length)
    console.error(
      "  ⚠ fable5_enabled is true but fable5_roles is empty — no effect until you\n" +
        "    select roles (e.g. `orc config set fable5_roles analyze,plan`)."
    );
  // opus5_only FORCES every role to Opus 5, so the whole Fable 5 block is inert
  // while it is on. Saying nothing here leaves a user tuning a dead setting.
  if (String(map.opus5_only) === "true")
    console.error(
      "  ⚠ opus5_only is true — the Fable 5 role override is INERT (every role\n" +
        "    dispatches its Opus 5 agent). Reset opus5_only to use it."
    );
}

function configList(claudeDir) {
  const { path: p, map } = readOverride(claudeDir);
  console.log(
    `\nORC config  (override: ${p}${fs.existsSync(p) ? "" : "  — not created yet"})\n`
  );
  const pad = Math.max(...CONFIG_META.map((m) => m.key.length));
  const forced = String(map.opus5_only) === "true";
  const tierLabel = { common: "Common", fable5: "Fable 5 role override", advanced: "Advanced" };
  for (const tier of ["common", "fable5", "advanced"]) {
    console.log(
      ui.header(tierLabel[tier] + (tier === "fable5" && forced ? "  (INERT — opus5_only is true)" : ""))
    );
    for (const m of CONFIG_META.filter((x) => x.tier === tier)) {
      const has = Object.prototype.hasOwnProperty.call(map, m.key);
      const val = has ? map[m.key] : m.def;
      const src = has ? ui.color.green("overridden") : ui.color.gray("default   ");
      const opts = m.options ? ` ${ui.color.gray("[options: " + m.options.join(" | ") + "]")}` : "";
      console.log(`  ${ui.color.cyan(m.key.padEnd(pad))}  ${String(val).padEnd(30)} ${src}  ${ui.color.gray(m.desc)}${opts}`);
    }
  }
  const extra = Object.keys(map).filter((k) => !metaFor(k));
  if (extra.length) {
    console.log("\nOther (hand-edited) overrides");
    for (const k of extra)
      console.log(
        `  ${k}: ${map[k]}` +
          (forced && k === "rubric_bands_override"
            ? ui.color.gray("   (INERT — opus5_only is true)")
            : "")
      );
  }
  console.log("");
}

// Which keys a currently-set key makes INERT. The CLI already announces this in
// prose at `config set` time (opus5Notice / opus5ConflictWarn / fable5Warn);
// this is the same rule expressed as data, so a non-terminal caller can render
// the shadow instead of parsing the sentence. ONE rule today: opus5_only
// outranks the whole fable5_* block and a hand-written rubric_bands_override.
function shadowReason(key, map) {
  if (String(map.opus5_only) !== "true") return null;
  if (key.startsWith("fable5_"))
    return "shadowed by opus5_only — every role dispatches its Opus 5 agent, so the Fable 5 override is inert";
  if (key === "rubric_bands_override")
    return "shadowed by opus5_only — executors use the fixed 3-band Opus 5 ladder";
  return null;
}

// The score→model ladder, as data. Read from DIY_SCORE_TABLE so the UI adds no
// SIXTH copy of a table already mirrored in five places (config.md,
// MODEL-MAPPING.md, effort-and-mode.md, build-agents.js VARIANTS, and that
// constant). `opus5_only` replaces it with the 3-band effort ladder.
const OPUS5_SCORE_TABLE = [
  [0, 40, "orc-executor-opus-5-low"],
  [40, 80, "orc-executor-opus-5-med"],
  [80, 101, "orc-executor-opus-5-high"],
];
const bandRows = (rows) =>
  rows.map(([lo, hi, agent]) => ({ from: lo, to: hi === 101 ? 100 : hi, inclusive_to: hi === 101, agent }));

function scoreTableJson(map) {
  const forced = String(map.opus5_only) === "true";
  return {
    // Which table RESOLVES (highest-wins): opus5_only > rubric_bands_override
    // (hand-written, registry-less) > the default 8-band.
    active: forced ? "opus5_only" : map.rubric_bands_override ? "rubric_bands_override" : "default",
    default: bandRows(DIY_SCORE_TABLE),
    opus5_only: bandRows(OPUS5_SCORE_TABLE),
  };
}

// `orc config list --json`. Everything the human table shows, plus the three
// things only a renderer needs: the control shape (derived from the validator),
// whether another key shadows this one, and the resolved score ladder.
function configListJson(claudeDir) {
  const { path: p, map } = readOverride(claudeDir);
  const has = (k) => Object.prototype.hasOwnProperty.call(map, k);
  const keys = CONFIG_META.map((m) => {
    const v = m.validate || {};
    const why = shadowReason(m.key, map);
    return {
      key: m.key,
      tier: m.tier,
      value: has(m.key) ? map[m.key] : m.def,
      default: m.def,
      is_overridden: has(m.key),
      is_shadowed: !!why,
      shadow_reason: why,
      desc: m.desc,
      options: m.options || null,
      control: {
        kind: v.kind || "text",
        choices: v.choices || null,
        min: v.min === undefined ? null : v.min,
        max: v.max === undefined ? null : v.max,
      },
    };
  });
  // Hand-edited keys CONFIG_META does not know — rubric_bands_override is the
  // designed case. Reported as read-only: `orc config set` refuses them, so an
  // editor offering to write one would be lying about what happens next.
  const extra = Object.keys(map)
    .filter((k) => !metaFor(k))
    .map((k) => ({
      key: k,
      value: map[k],
      is_shadowed: !!shadowReason(k, map),
      shadow_reason: shadowReason(k, map),
      editable: false,
    }));
  // A retired name still on disk. readOverride() resolves it away, so without
  // this the file says one thing and the listing says another.
  const legacy = [];
  try {
    const raw = fs.readFileSync(p, "utf8");
    for (const [old, now] of Object.entries(LEGACY_KEYS))
      if (new RegExp("^\\s*" + old + "\\s*:", "m").test(raw)) legacy.push({ key: old, renamed_to: now });
  } catch (_) {}
  emitJson({
    config_path: p,
    exists: fs.existsSync(p),
    keys,
    hand_edited: extra,
    legacy_keys: legacy,
    score_table: scoreTableJson(map),
    // Permanently on and deliberately not a key — say so, or a reader hunts for
    // the switch (only the folder is configurable).
    behavior_trace: { always_on: true, configurable_key: "log_dir" },
  });
}

function configSet(claudeDir, key, rawValue) {
  if (LEGACY_KEYS[key]) {
    console.error(
      `  ⚠ ${key} was renamed to ${LEGACY_KEYS[key]} in v0.36.0 (it now forces every\n` +
        `    dispatched role, not just executors) — writing ${LEGACY_KEYS[key]}.`
    );
    key = LEGACY_KEYS[key];
  }
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
  if (key === "fable5_effort") {
    const n = applyFable5Effort(claudeDir, res.value);
    if (n) console.log(`  ↳ rewrote effort: ${res.value} in ${n} Fable 5 agent file(s).`);
  }
  if (key.startsWith("fable5")) fable5Warn(claudeDir);
  if (key === "opus5_only") opus5Notice(String(res.value) === "true", claudeDir);
}

// The role→agent table this mode forces. Mirrors the mapping in
// templates/skills/_shared/opus5-only.md (documented drift — change together;
// a golden test asserts every agent named here exists in templates/agents/).
const OPUS5_ONLY_ROLES = [
  ["mini executor", "orc-executor-sonnet-5-high", "orc-executor-opus-5-low"],
  ["fast executor", "orc-executor-sonnet-4-6-high", "orc-executor-opus-5-low"],
  ["mini analyze", "orc-analyze-mini-sonnet-5-high", "orc-analyze-mini-opus-5-med"],
  ["mini plan", "orc-planner-mini-sonnet-5-high", "orc-planner-mini-opus-5-med"],
  ["scout", "orc-scout-sonnet-4-6-high", "orc-scout-opus-5-low"],
  ["pattern codify", "orc-pattern-codifier-sonnet-5-high", "orc-pattern-codifier-opus-5-med"],
  ["wiki scan", "orc-wiki-scanner-opus-4-8-high", "orc-wiki-scanner-opus-5-med"],
  ["claude write", "orc-claude-writer-opus-4-8-high", "orc-claude-writer-opus-5-med"],
  ["retro mine", "orc-retro-sonnet-5-high", "orc-retro-opus-5-med"],
];

// A `desc` string is only read by someone who runs `config list`, and this key
// changes what EVERY dispatch resolves to — so say the four things that matter
// at SET time: why it exists, what it actually resolves to, the tier it needs,
// and what it silently overrides.
function opus5Notice(on, claudeDir) {
  if (!on) {
    console.log(
      "\n  Every role is back to its default pin (executors → the 8-band mixed-model\n" +
        "  table). Any fable5_* / rubric_bands_override settings are live again."
    );
    return;
  }
  const pad = Math.max(...OPUS5_ONLY_ROLES.map((r) => r[0].length));
  const roleRows = OPUS5_ONLY_ROLES.map(
    (r) => `    ${r[0].padEnd(pad)}  →  ${r[2]}`
  ).join("\n");
  console.log(
    "\n  " + ui.color.bold("Opus-5-only dispatch is now ACTIVE — for EVERY role, not just executors.") + "\n" +
      "\n  Why: deep SWE-benchmark work on cost vs efficiency across Claude models finds a\n" +
      "  single Opus 5 agent, with the EFFORT ladder as the cost dial, the most efficient\n" +
      "  configuration. You trade model-class variety for effort variety.\n" +
      "\n  Scored executors (/orc + /orc-ultra):\n" +
      "\n    | Score     | Executor agent            |\n" +
      "    |-----------|---------------------------|\n" +
      "    | [0,40)    | orc-executor-opus-5-low   |\n" +
      "    | [40,80)   | orc-executor-opus-5-med   |\n" +
      "    | [80,100]  | orc-executor-opus-5-high  |\n" +
      "\n  Fixed roles now dispatched instead of their defaults:\n\n" + roleRows + "\n" +
      "\n  Already Opus 5, unchanged: analyst · planner · reviewer · verifier · test-author\n" +
      "  · combiner · learn-writer · advisor · judge.\n" +
      "  NEVER forced: orc-trace-writer-haiku-4-5 (it transcribes a packet, no reasoning)\n" +
      "  and orc-diy (its table is compile-owned — re-run `orc diy compile` to change it).\n" +
      "\n  " + ui.mark.warn("Tier requirement — read this one:") + "\n" +
      "  Today only the [90,100] executor band needs an Opus 5 main session. With this ON,\n" +
      "  EVERY dispatch does. A subagent can never outrank the main session, so on a lower\n" +
      "  session every role silently falls back to the session model and the tier-honesty\n" +
      "  rule reports a downgrade on EVERY return instead of occasionally. Hooks cannot\n" +
      "  block on model (only on effort), so this notice is the only up-front warning.\n" +
      "  This also ends orc-fast's \"runs fine at Sonnet medium\" — while ON it needs Opus 5.\n" +
      "\n  " + ui.color.bold("It FORCES.") + " While ON it outranks each role's default pin, the Fable 5\n" +
      "  role override, and a hand-written rubric_bands_override.\n" +
      "  Turn it off with: orc config reset opus5_only\n"
  );
  opus5ConflictWarn(claudeDir);
}

// Setting a key that another key now shadows is invisible unless we say so.
function opus5ConflictWarn(claudeDir) {
  if (!claudeDir) return;
  const { map } = readOverride(claudeDir);
  const shadowed = [];
  if (String(map.fable5_enabled) === "true")
    shadowed.push("fable5_enabled (+ fable5_roles / fable5_effort)");
  if (Object.prototype.hasOwnProperty.call(map, "rubric_bands_override"))
    shadowed.push("rubric_bands_override (hand-written executor table)");
  if (!shadowed.length) return;
  console.error(
    "  ⚠ INERT while opus5_only is true — these stay in your config but no run\n" +
      "    reads them:\n" +
      shadowed.map((s) => `      · ${s}`).join("\n") +
      "\n"
  );
}

function configReset(claudeDir, key) {
  if (key && LEGACY_KEYS[key]) key = LEGACY_KEYS[key];
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
        const adv = m.tier === "advanced" ? " (adv)" : m.tier === "fable5" ? " (fable5)" : "";
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
      if (m.key === "fable5_effort") {
        const n = applyFable5Effort(claudeDir, res.value);
        if (n) console.log(`  ↳ rewrote effort in ${n} Fable 5 agent file(s).`);
      }
      if (m.key.startsWith("fable5")) fable5Warn(claudeDir);
    }
    rl.close();
    console.log("done.");
  })();
}

// ── Config profiles (v0.42.0) — coherent bundles over the existing keys ─────
// Mirrors the working `orc diy init --preset` pattern. A profile is PURELY a
// batch of `orc config set` calls: every key is an existing, validated
// CONFIG_META key, so no key changes meaning and nothing here can express a
// state the interactive menu could not. That is the whole safety argument —
// a profile is a shortcut, never a second configuration system.
const CONFIG_PROFILES = {
  "solo-fast": {
    desc: "One person, moving fast, reads their own diffs. Fewer gates, bigger waves.",
    keys: {
      max_wave_tasks: 4,
      batch_pause_every: 3,
      default_analysis_depth: "standard",
      generate_tests: false,
      pattern_findings: "on",
      security_review: "off",
      mock_example: "off",
      stacked_pr: "off",
    },
  },
  balanced: {
    desc: "Today's defaults. Change nothing unless you know why.",
    keys: {
      max_wave_tasks: 3,
      batch_pause_every: 2,
      default_analysis_depth: "standard",
      generate_tests: false,
      pattern_findings: "ask",
      security_review: "off",
      mock_example: "ask",
      stacked_pr: "ask",
      run_budget_dispatches: 0,
    },
  },
  paranoid: {
    desc: "Shared codebase, real users. Every gate on, small waves, pause often.",
    keys: {
      max_wave_tasks: 2,
      batch_pause_every: 1,
      default_analysis_depth: "deep",
      generate_tests: true,
      pattern_findings: "on",
      security_review: "on",
      mock_example: "ask",
      stacked_pr: "ask",
      tdd_loop_max: 4,
    },
  },
  "token-lean": {
    desc: "Cheapest coherent setup: no deep scans, no extra passes, a hard dispatch budget.",
    keys: {
      max_wave_tasks: 3,
      batch_pause_every: 2,
      max_scouts: 1,
      default_analysis_depth: "standard",
      generate_tests: false,
      pattern_findings: "off",
      security_review: "off",
      mock_example: "off",
      run_budget_dispatches: 12,
    },
  },
};

// `orc config profile --json` — the bundles themselves, plus which keys each
// one would actually change from where this repo stands now. A profile is a
// preview-then-apply action in any UI, and a list with no diff is not a preview.
function configProfileJson(claudeDir) {
  const { map } = readOverride(claudeDir);
  emitJson({
    profiles: Object.entries(CONFIG_PROFILES).map(([name, prof]) => {
      const changes = [];
      for (const [key, value] of Object.entries(prof.keys)) {
        const m = metaFor(key);
        if (!m) continue;
        const res = m.validate(String(value));
        if (res.err) continue;
        const before = map[key] === undefined ? m.def : map[key];
        if (String(before) !== String(res.value))
          changes.push({ key, from: before, to: res.value });
      }
      return { name, desc: prof.desc, keys: prof.keys, changes };
    }),
  });
}

function configProfile(claudeDir, name) {
  if (!name || !CONFIG_PROFILES[name]) {
    console.log(ui.header("orc config profile — coherent setting bundles"));
    for (const [k, v] of Object.entries(CONFIG_PROFILES))
      console.log(`  ${ui.color.cyan(k.padEnd(12))} ${v.desc}`);
    console.log(
      "\n" +
        ui.color.gray(
          "Apply one with: orc config profile <name>\n" +
            "Every profile writes only existing, validated keys — nothing it sets is\n" +
            "something you could not set yourself with `orc config set`.\n" +
            "Not sure which? `orc config recommend` looks at this repo and suggests one."
        )
    );
    if (name) process.exit(1);
    return;
  }
  const prof = CONFIG_PROFILES[name];
  const { map } = readOverride(claudeDir);
  const changed = [];
  for (const [key, value] of Object.entries(prof.keys)) {
    const m = metaFor(key);
    if (!m) continue; // a profile can never invent a key
    const res = m.validate(String(value));
    if (res.err) continue;
    const before = map[key] === undefined ? m.def : map[key];
    if (String(before) !== String(res.value)) changed.push([key, before, res.value]);
    map[key] = res.value;
  }
  const p = writeOverride(claudeDir, map);
  console.log(ui.header(`profile: ${name}`));
  console.log("  " + prof.desc + "\n");
  if (!changed.length) console.log("  Nothing changed — this repo was already on that profile.");
  else
    console.log(
      ui.kv(changed.map(([k, before, after]) => [k, `${ui.color.gray(String(before))} ${ui.glyph.arrow} ${after}`]))
    );
  console.log(`\n  ${ui.color.gray("written to " + p)}`);
  console.log(ui.color.gray("  Undo any single key with: orc config reset <key>"));
}

// `orc config recommend` — probe the repo, suggest ONE profile, say WHY.
// Read-only: it never writes. The reasons are the point; a recommendation you
// cannot argue with is one you cannot correct.
function computeRecommend(claudeDir) {
  const root = path.join(claudeDir, "..");
  const has = (rel) => fs.existsSync(path.join(root, rel));
  const reasons = [];
  let score = { "solo-fast": 0, paranoid: 0, "token-lean": 0 };

  let pkg = null;
  try { pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")); } catch (_) {}
  const testScript = pkg && pkg.scripts && pkg.scripts.test && !/no test specified/i.test(pkg.scripts.test);
  if (testScript) { score.paranoid++; reasons.push("a real `npm test` script exists — gates have something to check"); }
  else reasons.push("no test runner detected — extra gates would have little to verify");

  const ci = has(".github/workflows") || has(".gitlab-ci.yml") || has("azure-pipelines.yml");
  if (ci) { score.paranoid++; reasons.push("CI is configured — this repo is shared, not a scratchpad"); }
  else { score["solo-fast"]++; reasons.push("no CI config found — looks like solo or early-stage work"); }

  let contributors = 0;
  try {
    const out = require("child_process")
      .execFileSync("git", ["shortlog", "-sne", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    contributors = out.trim().split("\n").filter(Boolean).length;
  } catch (_) {}
  if (contributors > 3) { score.paranoid++; reasons.push(`${contributors} contributors in history — coordination cost is real`); }
  else if (contributors) { score["solo-fast"]++; reasons.push(`${contributors} contributor(s) in history`); }

  let files = 0;
  try {
    const out = require("child_process")
      .execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    files = out.trim().split("\n").filter(Boolean).length;
  } catch (_) {}
  if (files > 1500) { score["token-lean"]++; reasons.push(`${files} tracked files — deep scans get expensive fast here`); }
  else if (files) reasons.push(`${files} tracked files`);

  const wiki = wikiState(claudeDir);
  if (wiki && wiki.state && wiki.state !== "none") reasons.push("a project wiki exists — grounding is already cheap");
  else { score["token-lean"]++; reasons.push("no wiki yet — every run re-derives context, so keep scans narrow"); }

  const monorepo = has("packages") || has("apps") || has("pnpm-workspace.yaml") || has("lerna.json");
  if (monorepo) { score["token-lean"]++; reasons.push("monorepo layout — scope each run narrowly"); }

  const best = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const pick = best[0][1] === 0 ? "balanced" : best[0][0];
  return { reasons, score, pick };
}

function configRecommend(claudeDir) {
  const { reasons, score, pick } = computeRecommend(claudeDir);
  if (wantsJson()) {
    emitJson({ recommended: pick, desc: CONFIG_PROFILES[pick].desc, reasons, scores: score });
    return;
  }
  console.log(ui.header("orc config recommend"));
  console.log("  What I looked at:");
  for (const r of reasons) console.log(`    ${ui.glyph.bullet} ${r}`);
  console.log(
    `\n  ${ui.glyph.arrow} ${ui.color.cyan(pick)} — ${CONFIG_PROFILES[pick].desc}`
  );
  console.log(
    "\n" +
      ui.color.gray(
        `  Apply it:   orc config profile ${pick}\n` +
          "  See them all: orc config profile\n" +
          "  This command only reads — nothing was changed."
      )
  );
}

function config() {
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["config", <sub?>, <key?>, <value?>]
  const sub = pos[1];
  switch (sub) {
    case "profile":
      // `--json` is a LISTING, never an apply: a machine-readable form of "what
      // would this bundle change" cannot also mutate the file.
      if (wantsJson()) configProfileJson(claudeDir);
      else configProfile(claudeDir, pos[2]);
      break;
    case "recommend":
      configRecommend(claudeDir);
      break;
    case undefined:
      if (wantsJson()) configListJson(claudeDir);
      else configInteractive(claudeDir);
      break;
    case "list":
    case "get":
      if (wantsJson()) configListJson(claudeDir);
      else configList(claudeDir);
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
          "       orc config profile [<name>] | recommend\n" +
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
// Model ranks: haiku 1 < sonnet-4-6 2 < sonnet-5 3 < opus-4-7 4 < opus-4-8 5 <
// opus-5 6 (fable-5 sits at 7 as a session tier, above every executor). Effort
// ranks: medium 1 < high 2 < xhigh 3 < max 4 (executors only ship medium/high).
const DIY_EXECUTORS = {
  "orc-executor-haiku-4-5": { model: 1, effort: 1 },
  "orc-executor-sonnet-4-6-med": { model: 2, effort: 1 },
  "orc-executor-sonnet-4-6-high": { model: 2, effort: 2 },
  "orc-executor-sonnet-5-high": { model: 3, effort: 2 },
  "orc-executor-opus-4-7-med": { model: 4, effort: 1 },
  "orc-executor-opus-4-7-high": { model: 4, effort: 2 },
  "orc-executor-opus-4-8-high": { model: 5, effort: 2 },
  "orc-executor-opus-5-high": { model: 6, effort: 2 },
};
// Session-tier grid (C.5) — the user composes whatever tier they want; DIY is
// SEPARATE from the baseline /orc rule. Effort half is guard-enforced, model
// half is statusline-warned. Fable 5 (model rank 7) sits above every executor.
const DIY_TIERS = {
  "sonnet-4-6-med": { model: 2, effort: 1, modelId: "claude-sonnet-4-6", effortName: "medium" },
  "sonnet-4-6-high": { model: 2, effort: 2, modelId: "claude-sonnet-4-6", effortName: "high" },
  "opus-4-7-med": { model: 4, effort: 1, modelId: "claude-opus-4-7", effortName: "medium" },
  "opus-4-7-high": { model: 4, effort: 2, modelId: "claude-opus-4-7", effortName: "high" },
  "opus-4-8-med": { model: 5, effort: 1, modelId: "claude-opus-4-8", effortName: "medium" },
  "opus-4-8-high": { model: 5, effort: 2, modelId: "claude-opus-4-8", effortName: "high" },
  "opus-4-8-xhigh": { model: 5, effort: 3, modelId: "claude-opus-4-8", effortName: "xhigh" },
  "opus-4-8-max": { model: 5, effort: 4, modelId: "claude-opus-4-8", effortName: "max" },
  "opus-5-med": { model: 6, effort: 1, modelId: "claude-opus-5", effortName: "medium" },
  "opus-5-high": { model: 6, effort: 2, modelId: "claude-opus-5", effortName: "high" },
  "opus-5-xhigh": { model: 6, effort: 3, modelId: "claude-opus-5", effortName: "xhigh" },
  "opus-5-max": { model: 6, effort: 4, modelId: "claude-opus-5", effortName: "max" },
  "fable-5-med": { model: 7, effort: 1, modelId: "claude-fable-5", effortName: "medium" },
  "fable-5-high": { model: 7, effort: 2, modelId: "claude-fable-5", effortName: "high" },
  "fable-5-xhigh": { model: 7, effort: 3, modelId: "claude-fable-5", effortName: "xhigh" },
  "fable-5-max": { model: 7, effort: 4, modelId: "claude-fable-5", effortName: "max" },
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
  { key: "mock_example", def: "ask", options: ["ask", "on", "off"], validate: vEnum("ask", "on", "off"), desc: "Post-verify mocked example + drift recovery (mock-examples/<slug>/, never committed)." },
  { key: "tdd", def: "on", options: ["on", "off"], validate: vEnum("on", "off"), desc: "TDD-anchored planning: plan-time tdd_spec, Wave-0 red tests, TDD gate in the verify slot." },
  { key: "gotchas", def: "on", options: ["on", "off"], validate: vEnum("on", "off"), desc: "Repair memory: inject scope-matching gotchas into executor slices and record one when a repair loop goes red → green." },
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

// The compiled flow AS A PIPELINE — one row per stitched block, in the exact
// order `diyCompile` concatenates them. This is the single source for the UI's
// flow stepper: the panel draws what this returns and never re-derives the
// shape from the raw keys, because a second idea of "which phases run, in what
// order" is drift no contract lint could see. A step is OFF when the key that
// owns it resolves to the literal "off"; blocks with no key always run.
// `locked-blocks.md` has no row on purpose — it is standing rules, not a phase.
const DIY_STEPS = [
  { block: "header", label: "intake", key: null, note: () => "self-gate" },
  { block: "trace", label: "trace", key: null, note: () => "always on" },
  { block: "wiki", label: "wiki", key: "wiki_gate" },
  { block: "analyze", label: "analyze", key: "analyze" },
  { block: "planning", label: "plan", key: "planning" },
  { block: "pattern", label: "pattern", key: "pattern" },
  { block: "scoring", label: "score", key: "scoring" },
  { block: "execution", label: "execute", key: null, note: (c) => (c.scoring === "off" ? c.fixed_executor || "(unset)" : "scored") },
  { block: "review", label: "review", key: "review" },
  { block: "security", label: "security", key: "security" },
  { block: "verify", label: "verify", key: "verify" },
  { block: "testgen", label: "testgen", key: "testgen" },
  { block: "mock-example", label: "mock", key: "mock_example" },
  { block: "ship", label: "ship", key: "ship_mode" },
  { block: "summary", label: "summary", key: "summary" },
];

function diySteps(cfg) {
  return DIY_STEPS.map((s) => {
    const value = s.key ? String(cfg[s.key] === "" ? "" : cfg[s.key]) : "";
    return {
      block: s.block,
      label: s.label,
      key: s.key,
      value,
      // OFF is a first-class state, not an absence: a phase you switched off
      // still occupies its slot so the pipeline reads the same width either way.
      on: value !== "off",
      note: s.note ? s.note(cfg) : value,
    };
  });
}

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
  if (cfg.tdd === "on" && cfg.verify === "off") {
    warnings.push("tdd is on but verify is off — the TDD gate runs in the verify slot; plan-time tests will be authored but never gate the ship");
  }
  if (cfg.autonomy === "hands-off" && (cfg.ship_mode === "commit" || cfg.ship_mode === "pr")) {
    warnings.push(`hands-off + ship_mode ${cfg.ship_mode}: git actions will run fully unattended`);
  }
  // The pinned reviewer/verifier moved to claude-opus-5 (model rank 6) in
  // v0.34.0 — anything below that tier silently runs them at the session model.
  if (tier && tier.model < 6 && (cfg.review !== "off" || cfg.verify !== "off")) {
    // Careful wording (v0.34.7): `session_tier` is a DECLARATION, not the real
    // session model — a hook cannot read the model, only the effort. On a
    // session that actually outranks the declared tier the pinned Opus 5 roles
    // run at FULL pin (observed), so asserting they "will" downgrade is a false
    // alarm; what is certain is only that a LOWER real session caps them.
    warnings.push(`session_tier ${cfg.session_tier} is below the pinned Opus 5 reviewer/verifier: if the REAL session is also below Opus 5 they run capped at it (the tier-honesty rule reports the actual model). A session above this tier runs them at full pin — but your executor table stays clipped to ${cfg.session_tier}; recompile to use the full ladder`);
  }
  return { errors, warnings };
}

// The single canonical 8-band score->model table (mirrors skills/orc/config.md
// — documented drift). No more narrow/wide preset: rubric_bands is granularity
// only, and this one table maps every score.
const DIY_SCORE_TABLE = [
  [0, 30, "orc-executor-haiku-4-5"],
  [30, 40, "orc-executor-sonnet-4-6-med"],
  [40, 55, "orc-executor-sonnet-4-6-high"],
  [55, 65, "orc-executor-sonnet-5-high"],
  [65, 70, "orc-executor-opus-4-7-med"],
  [70, 80, "orc-executor-opus-4-7-high"],
  [80, 90, "orc-executor-opus-4-8-high"],
  [90, 101, "orc-executor-opus-5-high"],
];

// Clip the table to the session tier: an over-tier agent collapses into the
// highest executor the tier allows. Done at COMPILE time, never at runtime.
function diyScoreTable(cfg) {
  const tier = DIY_TIERS[cfg.session_tier];
  const rows = DIY_SCORE_TABLE;
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
    "execution → review → security → verify → testgen → mock-example → ship →",
    "summary. TDD (when on) rides planning/execution/verify — not a phase slot.",
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
// The three states are also an EXIT-CODE contract (v0.34.7): 0 = READY,
// 1 = STALE | UNCONFIGURED. It used to exit 0 in all three, so anything
// branching on it treated a hard-blocked flow as runnable — the direct inverse
// of its sibling `orc pattern status`, where "the exit code IS the contract".
// Two status verbs in one CLI with opposite conventions is the bug.
//
// STALE also collects EVERY live trigger, not just the first. A flow stale ONLY
// because `orc update` bumped the payload used to report "config changed" —
// which flatly contradicts a user who knows they never touched their config,
// and invites suspicion of the tool rather than a recompile.
function diyStatus(claudeDir) {
  const p = diyPaths(claudeDir);
  if (!fs.existsSync(p.config) || !readDiyConfig(claudeDir))
    return { state: "UNCONFIGURED", reason: "no flow config — run `orc diy init`" };
  const lock = readDiyLock(claudeDir);
  if (!lock) return { state: "STALE", reason: "lock missing — run `orc diy init` again, then `orc diy compile`" };
  if (!lock.compiled_hash) return { state: "STALE", reason: "never compiled — run `orc diy compile`" };
  const triggers = [];
  if (lock.config_hash !== sha256(fs.readFileSync(p.config, "utf8")))
    triggers.push("config changed since the last compile");
  const installedV = installedPayloadVersion(claudeDir);
  if (lock.orc_version !== installedV)
    triggers.push(`orc updated ${lock.orc_version} → ${installedV}`);
  if (!fs.existsSync(p.compiled) || sha256(fs.readFileSync(p.compiled, "utf8")) !== lock.compiled_hash)
    triggers.push("compiled flow modified or missing");
  if (triggers.length)
    return { state: "STALE", reason: triggers.join("; ") + " — run `orc diy compile`", triggers };
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

  // `trace` sits right after the locked rules and is UNCONDITIONAL — behavior
  // tracing is permanent, not a flow key, so stitching it here is what stops a
  // user-composed pipeline from being the one lane that runs blind (it was).
  const order = ["header", null, "trace", "wiki", "analyze", "planning", "pattern", "scoring", "execution", "review", "security", "verify", "testgen", "mock-example", "ship", "summary"];
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
  if (wantsJson()) {
    const cfg = map ? diyResolve(map) : null;
    const v = cfg ? diyValidate(cfg) : { errors: [], warnings: [] };
    const p = diyPaths(claudeDir);
    return emitJson({
      state: st.state,
      reason: st.reason,
      triggers: st.triggers || [],
      configured: !!map,
      paths: { config: p.config, compiled: p.compiled, lock: p.lock },
      keys: DIY_META.map((m) => ({
        key: m.key,
        value: cfg ? cfg[m.key] : m.def,
        default: m.def,
        is_set: !!(map && m.key in map),
        desc: m.desc,
        // The CLOSED SET this key accepts, straight off DIY_META (v0.44.0). A
        // consumer that has to know the legal values otherwise has to keep its
        // own copy of them, and a copy of a closed set is drift by definition —
        // `orc ui` renders these as a dropdown so a flow key can never be
        // mistyped. `null` means the key is free text (flow_name is a slug).
        options: m.options ? m.options.map(String) : null,
      })),
      // The bootstrap catalog the interactive composer offers, in the SAME
      // order and with the same first option: an empty `name` is the wizard's
      // "full-lane defaults" (a bare `orc diy init`, no --preset flag).
      // `changes` is the preset's own diff against the defaults.
      //
      // `active` answers "am I on this one?" (v0.44.1) — a preset is IN USE
      // when every key it sets still holds that value. **`flow_name` is
      // excluded**: it is a label the user is free to rename, and renaming
      // `solo-fast` to `solo` must not make this forget where the flow came
      // from. A preset whose keys were all kept is still the shape you are on,
      // whatever else was tuned around it.
      presets: [
        { name: "", changes: {}, active: !!cfg && DIY_META.every((m) => m.key === "flow_name" || String(cfg[m.key]) === String(m.def)) },
        ...Object.entries(DIY_PRESETS).map(([name, changes]) => ({
          name,
          changes,
          active: !!cfg && Object.entries(changes).every(([k, v]) => k === "flow_name" || String(cfg[k]) === String(v)),
        })),
      ],
      errors: v.errors,
      warnings: v.warnings,
      // The compiled pipeline, in stitch order — see DIY_STEPS.
      steps: cfg ? diySteps(cfg) : [],
      // The tier-CLIPPED table this flow would actually compile — not the
      // canonical ladder. A DIY flow's executors are compile-owned.
      score_table: cfg ? diyScoreTable(cfg) : null,
    });
  }
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
      // Exit code IS the contract, mirroring `orc pattern status <lang>`:
      // 0 = READY (the flow can run), 1 = STALE | UNCONFIGURED (it cannot).
      const st = diyStatus(claudeDir);
      if (wantsJson()) emitJson(st, st.state === "READY" ? 0 : 1);
      console.log(`${st.state} — ${st.reason}`);
      process.exit(st.state === "READY" ? 0 : 1);
    }
    case "show":
      diyShow(claudeDir);
      break;
    case undefined:
      // --json is never the interactive menu (which prints a "non-interactive
      // shell" preamble when piped, breaking the one-object rule).
      if (wantsJson()) diyShow(claudeDir);
      else diyInteractive(claudeDir); // TTY menu; falls back to the table when piped
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
    // Coverage-relative, exactly like our own wiki (v0.41.0) — a peer running
    // delta refreshes was reported permanently STALE by the frozen oldest-doc
    // anchor too. Edges stay the DEFAULTS on purpose: the thresholds are a
    // local preference and a peer repo's config is not ours to read.
    const f = computeWikiFreshness(repoRoot, meta, { freshMax: 10, agingMax: 30 });
    if (f.tier !== "unknown") {
      info.tier = f.tier;
      info.distance = f.distance;
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
  const tier = info.tier
    ? `${info.tier}${info.distance === null || info.distance === undefined ? "" : ` (${info.distance}c)`} [peer defaults 10/30]`
    : "tier unknown (git unavailable there — using date only)";
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

// One object for both `crosslink list --json` and `crosslink status --json` —
// they differ only in what the human renderer chooses to print, and two shapes
// for one graph is a drift surface with no upside.
function crosslinkJson(claudeDir) {
  const cfg = readCrosslinkConfig(claudeDir);
  if (!cfg) return emitJson({ configured: false, self: null, nodes: [], links: [], needs_baseline: null });
  const isSelf = (x) => x === "self" || x === cfg.self;
  emitJson({
    configured: true,
    self: cfg.self,
    config_path: crosslinkPaths(claudeDir).config,
    nodes: cfg.nodes.map((n) => {
      const root = path.resolve(repoRootOf(claudeDir), n.repo_path);
      return {
        name: n.name,
        repo_path: n.repo_path,
        resolved_path: root,
        kinds: n.kinds || [],
        direction: crosslinkDirection(cfg, n.name),
        // Peer freshness uses the DEFAULT 10/30 edges by design — a peer repo's
        // config is not ours to read (see crosslinkProviderInfo).
        provider: crosslinkProviderInfo(root),
      };
    }),
    links: cfg.links.map((l) => ({
      from: l.from,
      to: l.to,
      via: l.via,
      relation: isSelf(l.from) ? "we-call" : isSelf(l.to) ? "they-call-us" : "external",
    })),
    needs_baseline: fs.existsSync(crosslinkPaths(claudeDir).needs) ? crosslinkPaths(claudeDir).needs : null,
  });
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

// Non-interactive add — the same write the interactive flow performs, reachable
// without a TTY. It exists because `orc ui` may only write by shelling the real
// command: a UI that assembled this YAML itself would be a second writer of the
// crosslink config, and the CLI is the ONLY writer by contract.
//
// Every validation below MIRRORS the interactive prompt that rejects the same
// input, so the two paths cannot diverge in what they accept.
function crosslinkAdd(claudeDir, name, repoPath) {
  const cfg = crosslinkEnsureSelf(claudeDir);

  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    console.error("❌ invalid slug — a-z, 0-9, dashes (must start alphanumeric).");
    process.exit(1);
  }
  if (name === cfg.self || cfg.nodes.some((n) => n.name === name)) {
    console.error(`❌ the name "${name}" is taken (or is this repo itself).`);
    process.exit(1);
  }
  if (!repoPath) {
    console.error("❌ a repo path is required (the repo ROOT, e.g. ../service-z).");
    process.exit(1);
  }

  const rawKinds = String(flag("--kinds") || "").trim();
  const kinds = [
    ...new Set(
      rawKinds
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        // Numbers index the catalog, exactly as at the interactive prompt.
        .map((tok) => (/^\d+$/.test(tok) && CROSSLINK_KINDS[Number(tok) - 1] ? CROSSLINK_KINDS[Number(tok) - 1] : tok.toLowerCase()))
    ),
  ];
  if (!kinds.length) {
    console.error("❌ at least one kind is required: --kinds <name|number>[,…]");
    console.error("   catalog: " + CROSSLINK_KINDS.join(", "));
    process.exit(1);
  }

  const dir = String(flag("--direction") || "calls");
  if (dir !== "calls" && dir !== "called-by") {
    console.error('❌ --direction must be "calls" (this repo calls them) or "called-by" (they call this repo).');
    process.exit(1);
  }
  const via = String(flag("--via") || kinds[0]).toLowerCase();
  if (!kinds.includes(via)) {
    console.error(`❌ --via must be one of the picked kinds: ${kinds.join(", ")}`);
    process.exit(1);
  }
  const target = String(flag("--target") || "self");
  const targetKey = target === "self" || target === cfg.self ? "self" : target;
  if (targetKey !== "self" && !cfg.nodes.some((n) => n.name === targetKey)) {
    console.error(`❌ --target "${target}" is not this repo or an already-linked repo.`);
    process.exit(1);
  }

  cfg.nodes.push({ name, repo_path: repoPath, kinds });
  const edge = dir === "calls" ? { from: targetKey, to: name, via } : { from: name, to: targetKey, via };
  cfg.links.push(edge);
  writeCrosslinkConfig(claudeDir, cfg);

  if (wantsJson()) {
    return emitJson({
      added: name,
      repo_path: repoPath,
      kinds,
      edge,
      // The provider probe is the honest part: a link to a repo with no wiki is
      // legal and useful, it is just worth less until they adopt crosslink.
      provider: crosslinkProviderInfo(path.resolve(repoRootOf(claudeDir), repoPath)),
    });
  }
  console.log(
    `✓ added ${name}  ·  edge ${edge.from} ──${via}──▶ ${edge.to}` +
      (edge.from === "self" ? "  (we consume → drift-checked)" : "")
  );
  console.log(crosslinkProviderLine(claudeDir, repoPath));
}

function crosslinkInteractive(claudeDir) {
  if (!process.stdin.isTTY) {
    console.log(
      "(non-interactive shell — showing the graph; add a link from a real terminal with `orc crosslink`,\n" +
        " or non-interactively with `orc crosslink add <name> <path> --kinds <a,b>`)"
    );
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
      if (wantsJson()) crosslinkJson(claudeDir);
      else crosslinkInteractive(claudeDir);
      break;
    case "list":
    case "show":
      if (wantsJson()) crosslinkJson(claudeDir);
      else crosslinkList(claudeDir);
      break;
    case "status":
      if (wantsJson()) crosslinkJson(claudeDir);
      else crosslinkStatus(claudeDir);
      break;
    case "add":
      crosslinkAdd(claudeDir, pos[2], pos[3]);
      break;
    case "kinds":
      // The catalog, machine-readable — so a picker can offer the real list
      // instead of a copy of it that drifts.
      if (wantsJson()) emitJson({ kinds: CROSSLINK_KINDS });
      else console.log(CROSSLINK_KINDS.join("\n"));
      break;
    case "remove":
      crosslinkRemove(claudeDir, pos[2]);
      break;
    default:
      console.error(
        `Unknown: orc crosslink ${pos[1]}\n` +
          "Usage: orc crosslink                 (interactive: add/list/remove/done)\n" +
          "       orc crosslink add <name> <repo-path> --kinds <a,b> [--direction calls|called-by]\n" +
          "                                            [--via <kind>] [--target self|<node>]\n" +
          "       orc crosslink [list | status | kinds | remove <name>]"
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

// Every wiki doc under wiki/, skipping the machine index (crosslink/ — which
// also holds the DERIVED federation atlas.md; never an unregistered doc, never
// bulk-deleted by a refresh), the archive, and INDEX.md itself. A .md without
// a doc_type header is not a wiki doc — reported, never silently folded into
// the registry. (The derived orientation doc — wiki/orc-orientation.md — DOES
// carry a standard header, so it registers here like any doc.)
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

// ── Wiki freshness (v0.41.0) — COVERAGE-RELATIVE, one shared engine ─────────
// The tier used to be `git rev-list --count <meta.scan_commit>..HEAD` against
// hardcoded 10/30 edges. Both halves were wrong:
//
//   1. `meta.scan_commit` is the OLDEST doc's anchor (oldestCommit above) and a
//      DELTA refresh — the default path since v0.33.0 — only re-scans TOUCHED
//      docs, so untouched docs keep their old `scanned_commit` and the anchor
//      CAN NEVER MOVE. Every refresh reported the same hash and a distance that
//      only ever grew: permanently STALE, exactly the state a refresh exists to
//      clear. (`wikiImpact` fixed this for its per-doc classification in
//      v0.34.5; the four other consumers were left on the frozen anchor.)
//   2. The edges ignored `wiki_fresh_max`/`wiki_aging_max`, so a user raising
//      the thresholds to quiet the STALE spam saw no change at all.
//
// The fix is semantic, not cosmetic: a doc is stale when commits since ITS OWN
// anchor touched files IT covers. A doc about auth does not rot because the
// README changed forty times. The wiki's tier is its WORST doc — overstating
// freshness stays the one error a freshness signal must not make — and a
// STRUCTURAL blind spot (changed files no doc covers) degrades it to STALE.
//
// Read-side only: `meta.scan_commit` keeps its meaning on disk (the
// conservative blind-spot floor), so no manifest migration and no re-scan.
function freshnessTier(distance, edges) {
  if (distance === null) return "unknown";
  if (distance < edges.freshMax) return "FRESH";
  if (distance <= edges.agingMax) return "AGING";
  return "STALE";
}

const TIER_RANK = { FRESH: 0, AGING: 1, STALE: 2, unknown: 3 };

// Git pathspecs for one registered doc's coverage. `covers` globs become
// `:(glob)` magic so git applies the same `**` semantics impactGlobRe does;
// `covered_files` keys are literal paths. A doc with neither cannot be measured
// against its own surface — the caller falls back to the plain distance.
function coveragePathspecs(entry) {
  const specs = [];
  for (const c of entry.covers || []) {
    const cc = String(c).replace(/\/$/, "");
    if (!cc) continue;
    specs.push(/[*?]/.test(cc) ? ":(glob)" + cc : cc);
  }
  for (const f of Object.keys(entry.covered_files || {})) {
    if (f) specs.push(f);
  }
  // A doc listing hundreds of covered files would blow the command line; the
  // globs alone are a faithful superset of that doc's surface.
  const uniq = [...new Set(specs)];
  return uniq.length > 200 ? uniq.filter((s) => s.startsWith(":(glob)")) : uniq;
}

function wikiFreshnessEdges(claudeDir) {
  const map = readOverride(claudeDir).map;
  return {
    freshMax: Number(map.wiki_fresh_max) || 10,
    agingMax: Number(map.wiki_aging_max) || 30,
  };
}

// The single source of tier truth for `wiki status`, `wiki sync`, `wiki impact`
// and (with foreign defaults) crosslink provider lines.
function computeWikiFreshness(root, meta, edges) {
  const out = {
    tier: "unknown",
    distance: null,
    anchor: null,
    perDoc: [],
    blind: [],
    reasons: [],
    edges,
  };
  const docs = Array.isArray(meta && meta.docs) ? meta.docs : [];
  const globalAnchor = meta && meta.scan_commit ? meta.scan_commit : null;

  for (const d of docs) {
    const anchor = d.scanned_commit || globalAnchor;
    const row = { file: d.file, anchor: anchor || null, distance: null, tier: "unknown", scoped: false };
    if (anchor) {
      const specs = coveragePathspecs(d);
      const argv = ["rev-list", "--count", `${anchor}..HEAD`];
      if (specs.length) argv.push("--", ...specs);
      let n = gitIn(root, argv);
      if (n !== null && /^\d+$/.test(n)) {
        row.distance = Number(n);
        row.scoped = specs.length > 0;
      } else if (specs.length) {
        // Unresolvable pathspec (a covers glob git rejects) — fall back to the
        // doc's plain distance rather than silently dropping the doc.
        n = gitIn(root, ["rev-list", "--count", `${anchor}..HEAD`]);
        if (n !== null && /^\d+$/.test(n)) row.distance = Number(n);
      }
    }
    row.tier = freshnessTier(row.distance, edges);
    out.perDoc.push(row);
  }

  // Worst doc wins. `unknown` only survives when NOTHING could be measured;
  // a single unmeasurable doc among measurable ones is reported per-doc but
  // must not mask a real STALE.
  const measured = out.perDoc.filter((r) => r.distance !== null);
  if (measured.length) {
    let worst = measured[0];
    for (const r of measured) if (r.distance > worst.distance) worst = r;
    out.tier = freshnessTier(worst.distance, edges);
    out.distance = worst.distance;
    out.anchor = worst.anchor;
    if (out.tier !== "FRESH")
      out.reasons.push(
        `${worst.file} is ${worst.distance} commit(s) behind on its own covered files ` +
          `(fresh < ${edges.freshMax}, aging <= ${edges.agingMax})`
      );
  } else {
    out.reasons.push("no doc carries a resolvable scanned_commit — freshness cannot be computed");
  }

  // STRUCTURAL blind spot: files changed since the conservative floor that NO
  // doc covers. This is a COVERAGE gap, not doc rot — the docs that exist are
  // still accurate, they just don't cover everything. So it degrades the tier by
  // exactly ONE step and never past AGING.
  //
  // Forcing STALE here would recreate the very bug this rewrite fixes from the
  // other direction: every repo grows a README edit or a new helper no doc
  // covers, so a permanent blind spot would mean a permanent STALE and refresh
  // would once again look like it changed nothing. STALE means "do not trust
  // these docs"; a blind spot does not say that. `orc wiki impact` still
  // escalates a blind spot to a FULL-refresh recommendation — that is the right
  // place for that signal, and double-counting it here only hides doc rot.
  if (globalAnchor) {
    const diff = gitIn(root, ["diff", "--name-only", `${globalAnchor}..HEAD`]);
    if (diff !== null) {
      const changed = diff.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      out.blind = changed.filter((f) => !IMPACT_NOISE.test(f) && !docs.some((d) => docCovers(d, f)));
      if (out.blind.length && out.tier === "FRESH") {
        out.tier = "AGING";
        out.reasons.push(
          `${out.blind.length} changed file(s) no doc covers (STRUCTURAL blind spot) — ` +
            "docs on disk are current; coverage is incomplete"
        );
      } else if (out.blind.length) {
        out.reasons.push(`${out.blind.length} changed file(s) no doc covers (STRUCTURAL blind spot)`);
      }
    }
  }
  return out;
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
// RECURSIVE (v0.34.5). The old single-level walk silently dropped every tag
// whose `kind` contains a `/` — and the payload's own catalog ships one
// (`auth/oidc`), so a well-formed, published tag was invisible while
// `sync --check` still exited 0. `kind` comes from the HEADER, so a sanitized
// one-level directory (`auth-oidc/`) and a legacy two-level one (`auth/oidc/`)
// both round-trip to the same identity; reading both is the migration.
// Returns { list, filesFound } so sync can assert found == written: "6 indexed"
// while 7 exist must never pass, whatever the cause.
function readCrosslinkProvided(paths) {
  if (!fs.existsSync(paths.crosslinkDir)) return { list: [], filesFound: 0 };
  const out = [];
  let filesFound = 0;
  const walk = (dir, kindParts) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(abs, kindParts.concat(e.name));
        continue;
      }
      if (!e.name.endsWith(".md")) continue;
      // atlas.md is DERIVED (the federation view) — never a tag, never counted.
      if (!kindParts.length && e.name === "atlas.md") continue;
      filesFound++;
      const h = parseDocHeader(fs.readFileSync(abs, "utf8"));
      if (!h || !h.tag) continue;
      out.push({
        tag: h.tag,
        kind: h.kind || kindParts.join("/") || null,
        file: path.relative(paths.root, abs).split(path.sep).join("/"),
        anchor: h.anchor || null,
        content_hash: h.content_hash || null,
      });
    }
  };
  walk(paths.crosslinkDir, []);
  out.sort((a, b) => a.tag.localeCompare(b.tag));
  return { list: out, filesFound };
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

  // last_scan answers "when was this wiki last updated", so it is the NEWEST
  // doc's stamp (v0.34.5). It used to take the oldest to match the commit
  // anchor — which reported a delta refresh's own start time while summarizing
  // docs written 20 minutes later, contradicting `orc wiki impact`.
  // `scan_commit` below stays the OLDEST doc's anchor deliberately: it is the
  // conservative floor for "everything since this commit may be undocumented".
  let stamp = null;
  for (const d of docs) {
    const at = parseScannedAt(d.header.scanned_at) || fs.statSync(d.abs).mtime;
    if (!stamp || at > stamp) stamp = at;
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

  const { list: provided, filesFound: crosslinkFiles } = readCrosslinkProvided(paths);
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

  return { paths, docs, skipped, registry, meta, index, prev, anchor, provided, crosslinkFiles, boundaryRows, prevProvided };
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
  // v0.34.5: compare the manifest MINUS volatile fields. `branch` is recorded
  // for information, so a plain feature-branch checkout used to make
  // `sync --check` exit 1 with nothing unindexed — and REPAIR takes precedence
  // over REFRESH, so every run on a branch was routed into a repair it did not
  // need. The INDEX is still compared byte-for-byte.
  const VOLATILE = ["branch"];
  const stable = (text) => {
    if (text === null) return null;
    try {
      const o = JSON.parse(text);
      for (const k of VOLATILE) delete o[k];
      return JSON.stringify(o, null, 2) + "\n";
    } catch (_) {
      return text;
    }
  };
  const changed = stable(curMeta) !== stable(nextMeta) || curIndex !== r.index;

  // Crosslink publish guards (plan v0.24.0 §B). Both are LOCAL-artifact integrity
  // (our own tags vs our own docs) — always gateable, they just never were.
  //   boundaryUnpublished: docs describe a boundary but zero tags on disk.
  //   n0trip: the manifest listed tags, now the folder is empty (a wipe).
  const boundaryUnpublished = r.boundaryRows > 0 && r.provided.length === 0;
  const n0trip = r.prevProvided > 0 && r.provided.length === 0;
  // v0.34.5: files on disk vs entries written. A tag file that exists and does
  // not reach the registry is a SILENT boundary loss — the failure `--check`
  // exists to catch, and the one it used to walk straight past.
  const tagsLost = r.crosslinkFiles - r.provided.length;
  const crosslinkAlarm = boundaryUnpublished || n0trip || tagsLost > 0;
  const alarmLines = () => {
    if (tagsLost > 0)
      console.error(
        `⚠ ${plural(tagsLost, "crosslink tag file")} on disk did NOT reach the registry ` +
          `(${r.crosslinkFiles} found, ${r.provided.length} indexed).\n` +
          "   A published boundary nothing can resolve is worse than none. Check each file's\n" +
          "   `tag:` header (`<kind>:<name>` is required — a nameless tag has no identity)."
      );
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
  if (r.anchor) {
    // TWO different numbers, and conflating them is what made a successful
    // refresh look like a no-op (v0.41.0). `scan_commit` is the conservative
    // BLIND-SPOT FLOOR — the oldest doc, deliberately frozen by a delta refresh.
    // The TIER is coverage-relative and is what actually answers "is my wiki
    // fresh". Printing only the floor, labelled as freshness, meant the same
    // hash and a growing distance after every successful refresh.
    console.log(`   coverage floor ${r.anchor.commit.slice(0, 8)} (oldest doc — ${r.anchor.distance} commits behind HEAD; blind-spot anchor, not the tier)`);
    const edges = wikiFreshnessEdges(claudeDir);
    const f = computeWikiFreshness(r.paths.root, r.meta, edges);
    console.log(
      `   freshness ${f.tier === "unknown" ? "tier unknown" : f.tier}` +
        (f.distance === null ? "" : ` (${f.distance}c on the worst doc's own covered files)`) +
        ` — \`orc wiki status\` for the breakdown`
    );
  } else {
    console.log("   ⚠ no resolvable scanned_commit in any doc — freshness tracking stays off until the next /orc-wiki refresh");
  }
  if (r.provided.length) console.log(`   ${plural(r.provided.length, "crosslink tag")} indexed`);
  if (crosslinkAlarm) { console.log(""); alarmLines(); }
  if (!r.meta.commands)
    console.log("   ⚠ no build/test commands recorded — orc-fast's smoke gate will rediscover them (a /orc-wiki refresh fills this in)");
  if (r.skipped.length)
    console.log(`   ⚠ skipped (no doc_type header): ${r.skipped.join(", ")}`);
  console.log("\n   Registration only — nothing was scanned and no doc was changed.");
}

function wikiStatus(claudeDir, { json } = {}) {
  const s = wikiState(claudeDir);
  const paths = wikiPaths(claudeDir);
  // --json (v0.41.0) mirrors `orc doctor --json`: machine-readable freshness so
  // hooks/CI — and skills — branch on a field instead of parsing human prose.
  if (json) {
    const out = { state: s.state, docs: s.docs || 0, tier: null, distance: null, anchor: null, last_scan: null, reasons: [], blind: 0, edges: wikiFreshnessEdges(claudeDir) };
    if (s.state === "registered") {
      const f = computeWikiFreshness(paths.root, s.meta, out.edges);
      out.tier = f.tier;
      out.distance = f.distance;
      out.anchor = f.anchor;
      out.reasons = f.reasons;
      out.blind = f.blind.length;
      out.last_scan = s.meta.last_scan || null;
      out.crosslink_tags = readCrosslinkProvided(paths).list.length;
    }
    // Always exit 0: the `state`/`tier` fields ARE the branch. Overloading the
    // exit code here would collide with the existence contract in
    // `_shared/detecting-artifacts.md`, where a non-zero wiki probe would read
    // as "absent" — and `unregistered` means the wiki very much exists.
    console.log(JSON.stringify(out, null, 2));
    return;
  }
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
      const edges = wikiFreshnessEdges(claudeDir);
      const f = computeWikiFreshness(paths.root, s.meta, edges);
      const tier = f.tier === "unknown" ? "tier unknown" : f.tier;
      // Crosslink surface — tags reported alongside docs (plan v0.24.0 §B4). A
      // documented boundary with zero tags is the user's exact symptom, so name
      // it here rather than let it read as a clean wiki.
      const provided = readCrosslinkProvided(paths).list.length;
      const { docs } = readWikiDocs(paths.wikiDir);
      const crossline = provided
        ? ` · crosslink tags: ${provided}`
        : countBoundaryRows(docs) > 0
          ? " · crosslink: UNPUBLISHED boundary (run `/orc-wiki crosslink`)"
          : "";
      console.log(
        `✓ registered — ${s.docs} docs · last_scan ${s.meta.last_scan || "?"} · ${tier}` +
          (f.distance === null ? "" : ` (${f.distance}c)`) +
          crossline
      );
      // The anchor that ACTUALLY pins the tier — the worst-covered doc, not the
      // manifest's frozen oldest-doc floor. This is the hash that moves when a
      // refresh does its job; printing the floor here is what made every
      // refresh look like it had changed nothing.
      if (f.anchor) {
        const worst = f.perDoc.find((r) => r.distance === f.distance && r.anchor === f.anchor);
        console.log(
          `  freshness anchor ${String(f.anchor).slice(0, 8)}` +
            (worst ? ` (${worst.file})` : "") +
            ` · edges: fresh < ${edges.freshMax}c, aging <= ${edges.agingMax}c` +
            " (config wiki_fresh_max / wiki_aging_max)"
        );
      }
      const counts = { FRESH: 0, AGING: 0, STALE: 0, unknown: 0 };
      for (const r of f.perDoc) counts[r.tier]++;
      console.log(
        `  per-doc: ${counts.FRESH} fresh · ${counts.AGING} aging · ${counts.STALE} stale` +
          (counts.unknown ? ` · ${counts.unknown} unmeasurable` : "")
      );
      if (f.tier === "AGING" || f.tier === "STALE") {
        const stale = f.perDoc
          .filter((r) => r.tier === "AGING" || r.tier === "STALE")
          .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.distance - a.distance)
          .slice(0, 5);
        for (const r of stale) console.log(`    ${r.tier.padEnd(5)} ${r.file} (${r.distance}c on its covered files)`);
      }
      for (const why of f.reasons) console.log(`  why: ${why}`);
      if (f.tier === "STALE" || f.tier === "AGING")
        console.log("  Fix: `/orc-wiki` refresh (delta by default — `orc wiki impact` shows the scope first).");
    }
  }
}

// ── orc wiki impact (v0.33.0) — commit-scoped delta probe ───────────────────
// Deterministic ground for the DELTA refresh path: `git diff --name-only
// <scan_commit>..HEAD` mapped against each registered doc's coverage (the
// covered_files hash map + covers globs the header parser already registers).
// Prints per-doc CLEAN | TOUCHED (n) | STRUCTURAL + a summary, and exits with
// a branchable code (like `orc pattern status`):
//   0 = CLEAN            nothing a registered doc covers changed
//   1 = cannot compute   no wiki / unregistered / no scan_commit / git failed
//   2 = DELTA            touched docs; a targeted per-doc refresh suffices
//   3 = FULL recommended threshold exceeded, STRUCTURAL blind spot, or aging
// The recommendation is advisory — the skill presents the table and the USER
// decides (never silently full).

// covers entries are dirs/globs; covered_files keys are exact paths.
function impactGlobRe(g) {
  const esc = g
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__GLOBSTAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__GLOBSTAR__/g, ".*");
  return new RegExp("^" + esc + "(/|$)");
}
function docCovers(entry, file) {
  if (entry.covered_files && entry.covered_files[file] !== undefined) return true;
  for (const c of entry.covers || []) {
    const cc = String(c).replace(/\/$/, "");
    if (/[*?]/.test(cc)) {
      if (impactGlobRe(cc).test(file)) return true;
    } else if (file === cc || file.startsWith(cc + "/")) return true;
  }
  return false;
}

// ORC's own on-disk artifacts are covered by no wiki doc BY DESIGN — changes
// there must never read as a documentation blind spot.
const IMPACT_NOISE = /^(wiki\/|\.claude\/|learning-docs\/|mock-examples\/|test-generator\/|poly-repo-implementation\/|\.gitignore$)/;

function wikiImpact(claudeDir) {
  const paths = wikiPaths(claudeDir);
  const s = wikiState(claudeDir);
  const asJson = wantsJson();
  // Exit 1 = "cannot compute" — three distinct reasons, all of which a caller
  // must be able to tell apart, so the JSON path names which one it hit.
  const cannot = (reason, hint) => {
    if (asJson) emitJson({ ok: false, state: s.state, reason, hint, recommendation: "unavailable" }, 1);
    console.log(hint);
    process.exit(1);
  };
  if (s.state === "none")
    cannot("no-wiki", "no wiki — nothing to diff against. Run `/orc-wiki` to build one.");
  if (s.state !== "registered")
    cannot(
      "not-registered",
      `⚠ wiki is ${s.state.toUpperCase()} — run \`orc wiki sync\` first, then re-run \`orc wiki impact\`.`
    );
  const meta = s.meta;
  if (!meta.scan_commit)
    cannot(
      "no-anchor",
      "⚠ no scan_commit in the manifest — impact needs a commit anchor; a /orc-wiki refresh restores it."
    );
  const diff = spawnSync("git", ["diff", "--name-only", `${meta.scan_commit}..HEAD`], {
    cwd: paths.root,
    encoding: "utf8",
  });
  if (diff.status !== 0)
    cannot(
      "git-failed",
      `⚠ git diff failed (is scan_commit ${String(meta.scan_commit).slice(0, 8)} still resolvable here?)`
    );
  const changed = (diff.stdout || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  // Per-doc changed-file sets from each doc's OWN `scanned_commit` (v0.34.5).
  // `meta.scan_commit` is the OLDEST doc's anchor by design, and a delta refresh
  // leaves untouched docs untouched — so the anchor never moves and a correct,
  // complete delta refresh re-reported the identical delta forever, telling the
  // user to run the expensive FULL refresh the feature exists to avoid. The
  // global diff stays the input to the blind-spot sweep, which genuinely needs
  // a repo-wide view.
  const perDocChanged = (d) => {
    const anchorC = d.scanned_commit || meta.scan_commit;
    if (anchorC === meta.scan_commit) return changed;
    const r2 = spawnSync("git", ["diff", "--name-only", `${anchorC}..HEAD`], {
      cwd: paths.root,
      encoding: "utf8",
    });
    if (r2.status !== 0) return changed; // unresolvable anchor → global view
    return (r2.stdout || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  };

  const say = asJson ? () => {} : (s) => console.log(s);
  const docs = Array.isArray(meta.docs) ? meta.docs : [];
  let touchedDocs = 0;
  let structuralDocs = 0;
  const rows = [];
  const pad = Math.max(12, ...docs.map((d) => d.file.length));
  say(`\norc wiki impact — ${changed.length} changed file(s) since scan_commit ${String(meta.scan_commit).slice(0, 8)}\n`);
  for (const d of docs) {
    const hits = perDocChanged(d).filter((f) => docCovers(d, f));
    // A covered file that no longer exists = the doc's anchor is gone
    // (deleted/renamed) — a targeted refresh can't re-anchor blind.
    const gone = Object.keys(d.covered_files || {}).filter(
      (f) => !fs.existsSync(path.join(paths.root, f))
    );
    if (gone.length) {
      structuralDocs++;
      rows.push({ file: d.file, state: "STRUCTURAL", hits: [], gone });
      say(`  STRUCTURAL   ${d.file.padEnd(pad)}  covered file(s) gone: ${gone.join(", ")}`);
    } else if (hits.length) {
      touchedDocs++;
      rows.push({ file: d.file, state: "TOUCHED", hits, gone: [] });
      say(`  TOUCHED (${hits.length})  ${d.file.padEnd(pad)}  ${hits.slice(0, 4).join(", ")}${hits.length > 4 ? " …" : ""}`);
    } else {
      rows.push({ file: d.file, state: "CLEAN", hits: [], gone: [] });
      say(`  CLEAN        ${d.file}`);
    }
  }

  // Blind spot: changed files no doc covers (ORC's own artifacts excluded).
  const blind = changed.filter(
    (f) => !IMPACT_NOISE.test(f) && !docs.some((d) => docCovers(d, f))
  );
  if (blind.length) {
    say(`\n  STRUCTURAL blind spot — ${plural(blind.length, "changed file")} no doc covers:`);
    for (const f of blind.slice(0, 10)) say("    " + f);
    if (blind.length > 10) say(`    … and ${blind.length - 10} more`);
  }

  const map = readOverride(claudeDir).map;
  const threshold = Number(map.wiki_delta_full_threshold) || 30;
  const edges = wikiFreshnessEdges(claudeDir);
  const agingMax = edges.agingMax;
  // v0.41.0: the aging reason reads the COVERAGE-RELATIVE distance, not
  // `meta.scan_commit`. The frozen oldest-doc anchor made `aging` permanently
  // true once the repo passed wiki_aging_max commits, so a wiki whose every doc
  // read CLEAN still exited 3 "FULL refresh recommended" forever — recommending
  // the expensive re-scan this whole delta path exists to avoid.
  const fresh = computeWikiFreshness(paths.root, meta, edges);
  const dist = fresh.distance === null ? null : String(fresh.distance);
  const aging = fresh.distance !== null && fresh.distance > agingMax;
  const pct = docs.length ? Math.round(((touchedDocs + structuralDocs) / docs.length) * 100) : 0;

  // `pct` counts touched + structural, so it measures REFRESH SCOPE, not
  // "touched" — and it is the number users tune wiki_delta_full_threshold
  // against, so the label has to say what it counts.
  say(`\n  summary: ${docs.length} registered · ${touchedDocs} touched · ${structuralDocs} structural · ${pct}% affected (threshold ${threshold}%)` + (dist !== null ? ` · freshness ${fresh.tier}, ${dist} commits behind on the worst doc's covered files` : ""));
  const fullReasons = [];
  if (pct > threshold) fullReasons.push(`affected ${pct}% > wiki_delta_full_threshold ${threshold}%`);
  if (structuralDocs || blind.length) fullReasons.push("STRUCTURAL change (gone anchors / blind spot)");
  if (aging) fullReasons.push(`worst doc ${dist} commits behind on its own covered files > wiki_aging_max ${agingMax}`);

  const clean = !touchedDocs && !structuralDocs && !blind.length && !aging;
  const recommendation = clean ? "CLEAN" : fullReasons.length ? "FULL" : "DELTA";
  if (asJson)
    emitJson(
      {
        ok: true,
        scan_commit: meta.scan_commit,
        changed_files: changed.length,
        docs: rows,
        blind_spot: blind,
        registered: docs.length,
        touched: touchedDocs,
        structural: structuralDocs,
        affected_pct: pct,
        threshold,
        freshness: { tier: fresh.tier, distance: fresh.distance, aging_max: agingMax },
        recommendation,
        reasons: fullReasons,
      },
      clean ? 0 : fullReasons.length ? 3 : 2
    );

  if (clean) {
    console.log("  → CLEAN — the wiki still covers HEAD; no refresh needed.");
    process.exit(0);
  }
  if (fullReasons.length) {
    console.log("  → FULL refresh recommended: " + fullReasons.join("; "));
    console.log("    (advisory — a delta refresh of the touched docs is still possible)");
    process.exit(3);
  }
  console.log("  → DELTA — regenerate only the touched docs, then `orc wiki sync`.");
  process.exit(2);
}

// ── W1: wiki partial refresh (v0.46.0) — usage · plan · debt ─────────────────
//
// `orc wiki impact` answers WHAT CHANGED. These three answer WHAT TO DO ABOUT
// IT, IN WHAT ORDER, FOR HOW MUCH — the half that was missing, and the reason a
// 2-line change used to cost a whole-lane spin-up at the most expensive scanner
// in the payload.
//
// THREE RULES THIS BLOCK MUST KEEP (see knowledge.md §4z.7):
//   1. `orc wiki sync` stays the ONLY writer of wiki-meta.json + INDEX.md, and
//      stays 100% derived from doc headers. Usage comes from TRACES, not headers,
//      so it gets its own file and its own writer — never a new manifest key.
//   2. `meta.scan_commit` is the OLDEST doc's anchor (the blind-spot floor) and
//      is NEVER read as a tier. Every per-doc decision here takes the same
//      per-doc `scanned_commit` path `wikiImpact`'s perDocChanged takes.
//   3. Edges come from `wiki_fresh_max` / `wiki_aging_max` via the one engine,
//      `computeWikiFreshness`. A hardcoded 10/30 anywhere below is a bug.

const WIKI_USAGE_FILE = "wiki-usage.json";
// How many recent runs the usage window covers. Not a config key: the number is
// the DENOMINATOR printed next to every count ("17/20"), so a user-tunable
// value would make two machines disagree about what "used" means while showing
// the same-looking fraction.
const WIKI_USAGE_RUNS = 20;

function wikiUsagePath(claudeDir) {
  return path.join(claudeDir, "orc", WIKI_USAGE_FILE);
}

// Point-of-use attribution, read back at last. Since v0.41.0 every dispatch
// whose slice carried wiki material writes a `wiki:` continuation and every
// return carries `wiki_used`; the run-level `WIKI-CONSULT` line records the
// selection. Two releases of clean data that nothing read.
//
// A doc counts ONCE per run however many slices carried it: the question is
// "how many of the last N runs found this page worth shipping", not "how many
// slices". Counting slices would rank a doc by the run's wave count.
const USE_DISPATCH = /wiki:\s*[A-Za-z]+\s*[—-]{1,2}[^→\n]*→\s*([^\n]+)/g;
const USE_CONSULT = /WIKI-CONSULT\s+\S+\s*::\s*docs=([^\n]+)/g;

function rebuildWikiUsage(claudeDir) {
  const dir = resolveLogDir(claudeDir);
  let names = [];
  try {
    names = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".txt"))
      .map((f) => ({ f, at: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.at - a.at)
      .slice(0, WIKI_USAGE_RUNS);
  } catch (_) {
    names = [];
  }
  const docs = {};
  for (const { f, at } of names) {
    const body = fs.readFileSync(path.join(dir, f), "utf8");
    const seen = new Set();
    for (const re of [USE_DISPATCH, USE_CONSULT]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(body))) {
        for (const raw of m[1].split(",")) {
          const d = raw.trim().replace(/^`|`$/g, "");
          // `none` is the informative return, not a doc. Recorded as a run that
          // consulted nothing, never as a page named "none".
          if (!d || d === "none" || !/\.md$/.test(d)) continue;
          seen.add(d.replace(/^wiki\//, ""));
        }
      }
    }
    for (const d of seen) {
      const e = (docs[d] = docs[d] || { used: 0, last_used: null });
      e.used += 1;
      if (!e.last_used || at > e.last_used) e.last_used = at;
    }
  }
  const out = {
    version: 1,
    rebuilt_at: fmtStamp(new Date()),
    window_runs: WIKI_USAGE_RUNS,
    runs_scanned: names.length,
    log_dir: dir,
    docs,
  };
  const p = wikiUsagePath(claudeDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
  return out;
}

function readWikiUsage(claudeDir) {
  const p = wikiUsagePath(claudeDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

// The usage lookup is by BASENAME as well as by registry path: a doc registers
// as `wiki/orc-feature-x.md` and a trace names it `orc-feature-x.md`.
function usageFor(usage, file) {
  if (!usage || !usage.docs) return null;
  const base = String(file).replace(/^wiki\//, "");
  const hit = usage.docs[base] || usage.docs[file] || null;
  if (!hit) return { used: 0, last_used: null };
  return hit;
}

// ── the scan tier ladder (B5) — the biggest single cut ───────────────────────
// Every scan-task used to dispatch `orc-wiki-scanner-opus-4-8-high` whether the
// delta was 2 lines or 2000. The ladder sends a small, no-new-surface delta to
// the LIGHT scanner instead. Five rows, in order; first match wins.
//
// NEVER SILENT: the resolved tier is printed in `orc wiki plan` and in the
// refresh confirmation. A cheaper model is a decision the user sees, never a
// quiet substitution.
const WIKI_SCANNER_DEEP = "orc-wiki-scanner-opus-4-8-high";
const WIKI_SCANNER_LIGHT = "orc-wiki-scanner-sonnet-5-high";
// `opus5_only` already forces the wiki scanner to the shipped
// orc-wiki-scanner-opus-5-med, so BOTH tiers collapse to that one agent while
// the flag is on. That is why the ladder adds NO row to OPUS5_ONLY_ROLES and no
// new agent pair: see _shared/opus5-only.md.
const WIKI_SCANNER_OPUS5 = "orc-wiki-scanner-opus-5-med";

const WIKI_TIER_LADDER = [
  { id: "first-scan", tier: "deep", why: "first scan of this area (no doc yet)" },
  { id: "structural", tier: "deep", why: "STRUCTURAL — a covered file is gone; a targeted refresh cannot re-anchor blind" },
  { id: "wide-delta", tier: "deep", why: "covered files touched >= wiki_tier_deep_files" },
  { id: "new-surface", tier: "deep", why: "a new exported symbol in a covered file" },
  { id: "small-delta", tier: "light", why: "small delta, no new surface" },
];

// `always_deep` restores pre-v0.46.0 behaviour exactly: every row returns deep.
function wikiScanTier(input, cfg) {
  const always = String((cfg && cfg.wiki_scan_tier) || "ladder") === "always_deep";
  const deepFiles = Number((cfg && cfg.wiki_tier_deep_files) || 3);
  let rowId = "small-delta";
  if (input.first_scan) rowId = "first-scan";
  else if (input.structural) rowId = "structural";
  else if ((input.touched || 0) >= deepFiles) rowId = "wide-delta";
  else if (input.new_surface) rowId = "new-surface";
  const row = WIKI_TIER_LADDER.find((r) => r.id === rowId);
  const tier = always ? "deep" : row.tier;
  const agent = cfg && String(cfg.opus5_only) === "true"
    ? WIKI_SCANNER_OPUS5
    : tier === "deep"
      ? WIKI_SCANNER_DEEP
      : WIKI_SCANNER_LIGHT;
  return {
    tier,
    agent,
    rule: row.id,
    why: always && row.tier === "light" ? "wiki_scan_tier=always_deep overrides the ladder" : row.why,
  };
}

// A new EXPORTED symbol in a covered file is a new surface the doc's contract
// section cannot describe from its old body, so it earns the deep scanner.
// Deliberately conservative and language-agnostic: it greps the ADDED lines of
// the doc's own diff for the handful of export forms that are unambiguous.
const EXPORT_ADD = /^\+\s*(export\s+(default\s+)?(async\s+)?(function|class|const|let|var|interface|type|enum)\b|(func|type)\s+[A-Z]|public\s+(static\s+)?[A-Za-z<>[\]]+\s+[A-Za-z_]|def\s+[a-z_]+|module\.exports)/;

function docHasNewSurface(root, anchor, files) {
  if (!anchor || !files.length) return false;
  const argv = ["diff", "--unified=0", `${anchor}..HEAD`, "--", ...files.slice(0, 60)];
  const out = gitIn(root, argv);
  if (out === null) return false;
  return out.split(/\r?\n/).some((l) => EXPORT_ADD.test(l));
}

// The shared engine behind `wiki plan` and `wiki debt`. Returns rows already in
// RANKED order, plus the freshness object and the resolved config.
//
// THE RANKING RULE (B3):
//   1. STRUCTURAL always first — a doc pointing at a missing file is actively
//      lying, and no cheaper step repairs it.
//   2. Then by USE x DELTA, where `used` is how many of the last N runs put that
//      doc into a slice. Refresh what gets read.
//   3. Zero-use docs sink to the bottom with a retire hint. They cost money on
//      every full refresh and context tokens whenever they ARE included.
function wikiPlanRows(claudeDir) {
  const paths = wikiPaths(claudeDir);
  const s = wikiState(claudeDir);
  if (s.state === "none") return { error: "no-wiki", state: s.state };
  if (s.state !== "registered") return { error: "not-registered", state: s.state };
  const meta = s.meta;
  const docs = Array.isArray(meta.docs) ? meta.docs : [];
  const cfg = resolvedConfig(claudeDir);
  const edges = wikiFreshnessEdges(claudeDir);
  const fresh = computeWikiFreshness(paths.root, meta, edges);
  const usage = readWikiUsage(claudeDir);
  const rates = budgetRates(claudeDir);

  const globalAnchor = meta.scan_commit || null;
  const perDocChanged = (d) => {
    const anchorC = d.scanned_commit || globalAnchor;
    if (!anchorC) return [];
    const out = gitIn(paths.root, ["diff", "--name-only", `${anchorC}..HEAD`]);
    if (out === null) return [];
    return out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  };

  const rows = [];
  for (const d of docs) {
    const anchor = d.scanned_commit || globalAnchor;
    const hits = perDocChanged(d).filter((f) => docCovers(d, f));
    const gone = Object.keys(d.covered_files || {}).filter(
      (f) => !fs.existsSync(path.join(paths.root, f))
    );
    const structural = gone.length > 0;
    if (!structural && !hits.length) continue; // CLEAN — no work, no row
    const newSurface = !structural && docHasNewSurface(paths.root, anchor, hits);
    const t = wikiScanTier(
      { first_scan: false, structural, touched: hits.length, new_surface: newSurface },
      cfg
    );
    const u = usageFor(usage, d.file);
    const est = budgetScanEstimate(rates, t.agent);
    rows.push({
      doc: d.file,
      state: structural ? "STRUCTURAL" : "TOUCHED",
      delta: hits.length,
      delta_files: hits.slice(0, 8),
      gone,
      used: u ? u.used : null,
      used_of: usage ? usage.window_runs || WIKI_USAGE_RUNS : null,
      last_used: u && u.last_used ? new Date(u.last_used).toISOString().slice(0, 10) : null,
      tier: t.tier,
      agent: t.agent,
      tier_rule: t.rule,
      tier_why: t.why,
      new_surface: newSurface,
      estimate: est,
      // Priced HERE, so the JSON consumer (and `orc ui`) never has to know a
      // rate table exists. A row we cannot price carries null, never a guess.
      usd: est ? priceVector(claudeDir, est.p50, t.agent).usd : null,
      retire_hint: !!(usage && u && u.used === 0),
    });
  }

  // STRUCTURAL first, then use x delta, then zero-use last. `used === null`
  // (no usage file yet) is NOT zero-use: unknown must never be ranked as dead.
  const weight = (r) => (r.used === null ? 1 : r.used) * Math.max(1, r.delta);
  rows.sort((a, b) => {
    const as = a.state === "STRUCTURAL" ? 0 : 1;
    const bs = b.state === "STRUCTURAL" ? 0 : 1;
    if (as !== bs) return as - bs;
    const az = a.used === 0 ? 1 : 0;
    const bz = b.used === 0 ? 1 : 0;
    if (az !== bz) return az - bz;
    return weight(b) - weight(a) || a.doc.localeCompare(b.doc);
  });

  return { rows, docs, meta, fresh, edges, cfg, usage, rates, root: paths.root, state: s.state };
}

// The free-repairs ladder (B9). A user must NEVER be able to pay for something a
// free step would have fixed, so the ordering is a hard rule in the CLI as well
// as in the skill: sync, orientation, crosslink backfill, and only THEN a
// targeted refresh that costs money.
function freeRepairs(claudeDir, p) {
  const out = [];
  if (p.state !== "registered")
    out.push({ id: "sync", cost: "free", cmd: "orc wiki sync", what: "register the docs on disk (fixes UNREGISTERED)" });
  const hasOrientation = (p.docs || []).some((d) => /orc-orientation\.md$/.test(d.file));
  if (!hasOrientation)
    out.push({ id: "orientation", cost: "free", cmd: "/orc-wiki refresh wiki/orc-orientation.md", what: "regenerate the derived orientation doc (read first by every consumer)" });
  // countBoundaryRows reads doc BODIES, so it takes readWikiDocs output — never
  // the manifest entries, which carry headers only.
  const onDisk = readWikiDocs(wikiPaths(claudeDir).wikiDir).docs;
  if (countBoundaryRows(onDisk) > 0) {
    const dir = path.join(wikiPaths(claudeDir).crosslinkDir);
    let tags = 0;
    try {
      for (const k of fs.readdirSync(dir, { withFileTypes: true }))
        if (k.isDirectory()) tags += fs.readdirSync(path.join(dir, k.name)).filter((f) => f.endsWith(".md")).length;
    } catch (_) {}
    if (!tags)
      out.push({ id: "crosslink", cost: "free", cmd: "/orc-wiki crosslink", what: "publish boundary tags from already-anchored doc rows" });
  }
  return out;
}

const sumVec = (a, b) => ({
  input: (a.input || 0) + (b.input || 0),
  cache_write: (a.cache_write || 0) + (b.cache_write || 0),
  cache_read: (a.cache_read || 0) + (b.cache_read || 0),
  output: (a.output || 0) + (b.output || 0),
});
const ZERO_VEC = { input: 0, cache_write: 0, cache_read: 0, output: 0 };

function wikiPlan(claudeDir) {
  const asJson = wantsJson();
  const p = wikiPlanRows(claudeDir);
  if (p.error) {
    const hint =
      p.error === "no-wiki"
        ? "no wiki — nothing to plan. Run `/orc-wiki` to build one."
        : `⚠ wiki is ${String(p.state).toUpperCase()} — run \`orc wiki sync\` first (free), then re-run \`orc wiki plan\`.`;
    if (asJson) emitJson({ ok: false, reason: p.error, state: p.state, hint, rows: [] }, 3);
    console.log(hint);
    process.exit(3);
  }
  const rows = p.rows;
  const repairs = freeRepairs(claudeDir, p);
  const deep = rows.filter((r) => r.tier === "deep").length;
  const totals = rows.reduce(
    (acc, r) => (r.estimate ? sumVec(acc, r.estimate.p50) : acc),
    { ...ZERO_VEC }
  );
  const priced = rows.every((r) => r.estimate);
  const money = priced ? priceVector(claudeDir, totals, rows[0] && rows[0].agent) : null;
  const code = !rows.length ? 0 : deep ? 2 : 1;

  if (asJson)
    emitJson(
      {
        ok: true,
        registered: p.docs.length,
        pending: rows.length,
        deep,
        light: rows.length - deep,
        rows,
        free_repairs: repairs,
        usage_window: p.usage ? p.usage.window_runs : null,
        usage_runs_scanned: p.usage ? p.usage.runs_scanned : null,
        estimate: priced ? { tokens: totals, usd: money && money.usd, weighted: money && money.weighted } : null,
        estimate_unavailable: priced ? null : "insufficient history",
        freshness: { tier: p.fresh.tier, distance: p.fresh.distance, edges: p.edges },
        scan_tier_mode: String(p.cfg.wiki_scan_tier || "ladder"),
      },
      code
    );

  if (!rows.length) {
    console.log(`\norc wiki plan — nothing to do. ${plural(p.docs.length, "doc")} registered, all CLEAN.`);
    if (repairs.length) {
      console.log("\n  free repairs available (no model, no cost):");
      for (const r of repairs) console.log(`    ${r.cmd.padEnd(46)} ${r.what}`);
    }
    process.exit(0);
  }

  console.log(`\norc wiki plan — ${rows.length} of ${p.docs.length} docs need work\n`);
  const w = Math.max(24, ...rows.map((r) => r.doc.replace(/^wiki\//, "").length));
  console.log(
    "  #  " + "doc".padEnd(w) + "  state       delta   used   tier    est. tokens   est. $"
  );
  console.log("  " + "─".repeat(w + 58));
  rows.forEach((r, i) => {
    const est = r.estimate;
    const tok = est
      ? `${kTok(est.p50.input + est.p50.cache_write + est.p50.cache_read)} / ${kTok(est.p50.output)}`
      : "—";
    const usd = est ? "$" + priceVector(claudeDir, est.p50, r.agent).usd.toFixed(2) : "—";
    const used = r.used === null ? "  ?  " : `${r.used}/${r.used_of}`;
    console.log(
      `  ${String(i + 1).padStart(2)}  ${r.doc.replace(/^wiki\//, "").padEnd(w)}  ` +
        `${r.state.padEnd(11)} ${(r.state === "STRUCTURAL" ? "—" : String(r.delta) + " file" + (r.delta === 1 ? "" : "s")).padEnd(7)} ` +
        `${used.padEnd(6)} ${r.tier.padEnd(7)} ${tok.padEnd(13)} ${usd}`
    );
    if (r.state === "STRUCTURAL") console.log(`      covered file gone: ${r.gone.slice(0, 3).join(", ")}`);
    if (r.retire_hint)
      console.log(`      ⓘ never used in the last ${r.used_of} runs — consider retiring instead`);
  });
  console.log("  " + "─".repeat(w + 58));
  if (priced) {
    const all = priceVector(claudeDir, totals, rows[0].agent);
    console.log(
      `  clear everything        ${String(rows.length).padStart(2)} tasks   ${kTok(totals.input + totals.cache_write + totals.cache_read + totals.output)} tokens   $${all.usd.toFixed(2)}`
    );
  } else {
    console.log(`  estimate: insufficient history — run \`orc budget calibrate\` after a run or two.`);
  }
  if (repairs.length) {
    console.log("\n  free repairs FIRST (a user must never pay for what a free step fixes):");
    for (const r of repairs) console.log(`    ${r.cmd.padEnd(46)} ${r.what}`);
  }
  console.log(
    `\n  tier: ${deep} deep · ${rows.length - deep} light` +
      (String(p.cfg.wiki_scan_tier || "ladder") === "always_deep" ? "   (wiki_scan_tier=always_deep)" : "") +
      `\n  Run:  /orc-wiki refresh --top ${Math.min(2, rows.length)}`
  );
  process.exit(code);
}

function wikiDebt(claudeDir) {
  const asJson = wantsJson();
  const p = wikiPlanRows(claudeDir);
  if (p.error) {
    const hint = p.error === "no-wiki" ? "no wiki — no debt to report. Run `/orc-wiki` to build one." : `⚠ wiki is ${String(p.state).toUpperCase()} — run \`orc wiki sync\` (free) first.`;
    if (asJson) emitJson({ ok: false, reason: p.error, hint, pending: 0 }, 3);
    console.log(hint);
    process.exit(3);
  }
  const rows = p.rows;
  const totals = rows.reduce((acc, r) => (r.estimate ? sumVec(acc, r.estimate.p50) : acc), { ...ZERO_VEC });
  const priced = rows.length > 0 && rows.every((r) => r.estimate);
  const money = priced ? priceVector(claudeDir, totals, rows[0].agent) : null;
  // Debt AGE is the worst pending doc's own coverage-relative distance — the
  // same per-doc number `computeWikiFreshness` computes, never a global date.
  const byDoc = new Map((p.fresh.perDoc || []).map((r) => [r.file, r]));
  const ages = rows.map((r) => (byDoc.get(r.doc) || {}).distance).filter((n) => typeof n === "number");
  const oldest = ages.length ? Math.max(...ages) : null;
  const name = path.basename(p.root);

  if (asJson)
    emitJson(
      {
        ok: true,
        project: name,
        pending: rows.length,
        deep: rows.filter((r) => r.tier === "deep").length,
        tokens: priced ? totals : null,
        usd: money ? money.usd : null,
        oldest_commits_behind: oldest,
        tier: p.fresh.tier,
        edges: p.edges,
        docs: rows.map((r) => ({ doc: r.doc, state: r.state, tier: r.tier, used: r.used })),
      },
      rows.length ? 1 : 0
    );

  if (!rows.length) {
    console.log(`\nWIKI DEBT · ${name}\n  0 docs pending — nothing owed. Tier ${p.fresh.tier}.`);
    process.exit(0);
  }
  console.log(`\nWIKI DEBT · ${name}`);
  console.log(
    `  ${plural(rows.length, "doc")} pending` +
      (priced ? ` · ${kTok(totals.input + totals.cache_write + totals.cache_read + totals.output)} tokens · $${money.usd.toFixed(2)}` : " · estimate unavailable (insufficient history)") +
      (oldest === null ? "" : ` · oldest debt ${oldest} commits`)
  );
  console.log(`  tier:    ${p.fresh.tier} (edges wiki_fresh_max=${p.edges.freshMax}, wiki_aging_max=${p.edges.agingMax})`);
  const structural = rows.filter((r) => r.state === "STRUCTURAL").length;
  console.log(`  states:  ${structural} STRUCTURAL · ${rows.length - structural} TOUCHED`);
  console.log(
    "  Nothing is broken." +
      (priced && rows.length > 2 ? ` Clear the top 2 and debt drops.` : "") +
      `\n  Ranked list:  orc wiki plan`
  );
  process.exit(1);
}

function wikiUsageCmd(claudeDir, { rebuild } = {}) {
  const asJson = wantsJson();
  let usage = rebuild ? rebuildWikiUsage(claudeDir) : readWikiUsage(claudeDir);
  if (!usage) {
    // Absent is not an error — build it, since the input (traces) is already on
    // disk and free to read. Only an empty trace corpus is a real "no data".
    usage = rebuildWikiUsage(claudeDir);
  }
  const s = wikiState(claudeDir);
  const registered = s.meta && Array.isArray(s.meta.docs) ? s.meta.docs.map((d) => d.file) : [];
  const rows = registered.map((f) => {
    const u = usageFor(usage, f);
    return {
      doc: f,
      used: u.used,
      of: usage.window_runs,
      last_used: u.last_used ? new Date(u.last_used).toISOString().slice(0, 10) : null,
    };
  });
  rows.sort((a, b) => b.used - a.used || a.doc.localeCompare(b.doc));
  const dead = rows.filter((r) => !r.used);

  if (asJson)
    emitJson(
      {
        ok: true,
        file: wikiUsagePath(claudeDir),
        window_runs: usage.window_runs,
        runs_scanned: usage.runs_scanned,
        rebuilt_at: usage.rebuilt_at,
        registered: registered.length,
        in_active_use: rows.length - dead.length,
        never_used: dead.length,
        rows,
      },
      usage.runs_scanned ? 0 : 1
    );

  if (!usage.runs_scanned) {
    console.log(`No traces under ${usage.log_dir} — usage cannot be computed yet. Run any lane once.`);
    process.exit(1);
  }
  console.log(`\nWIKI USAGE · last ${plural(usage.runs_scanned, "run")} (window ${usage.window_runs})\n`);
  const w = Math.max(24, ...rows.map((r) => r.doc.replace(/^wiki\//, "").length));
  for (const r of rows)
    console.log(
      `  ${r.doc.replace(/^wiki\//, "").padEnd(w)}  ${String(r.used).padStart(2)}/${r.of}  ${r.last_used || "never"}`
    );
  if (dead.length)
    console.log(
      `\n  ${plural(dead.length, "doc")} never put into a slice in ${usage.window_runs} runs. That costs money on\n` +
        `  every full refresh — and context tokens whenever ${dead.length === 1 ? "it is" : "they are"} included.\n` +
        `  Retire with /orc-wiki (moves to wiki/retired/, drops from INDEX.md). Reversible; never a delete.`
    );
  process.exit(0);
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

// The language keys the payload actually knows, parsed from the codifier's
// detection table (`orc-pattern/references/INDEX.md`). Project install first,
// package templates as the fallback — the same resolution `orc diy` uses.
function knownPatternLangs(claudeDir) {
  for (const base of [
    path.join(claudeDir, "skills", "orc-pattern", "references"),
    path.join(SRC_SKILLS, "orc-pattern", "references"),
  ]) {
    const f = path.join(base, "INDEX.md");
    try {
      const rows = [...fs.readFileSync(f, "utf8").matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)].map((m) => m[1]);
      if (rows.length) return rows;
    } catch (_) {}
  }
  return [];
}

// The cached patterns as data, with each file's mtime — the only freshness
// signal a pattern has (unlike the wiki, it carries no commit anchor).
function patternEntries(claudeDir) {
  const dir = patternsDir(claudeDir);
  return listPatternLangs(claudeDir).map((lang) => {
    const file = path.join(dir, lang + "-pattern.md");
    let mtime = null;
    try { mtime = Math.round(fs.statSync(file).mtimeMs); } catch (_) {}
    return { lang, path: file, mtime_ms: mtime };
  });
}

function patternStatus(claudeDir, lang) {
  const langs = listPatternLangs(claudeDir);
  // The exit code is the contract (0 cached / 1 absent / 2 unknown key) and
  // --json must not disturb it — so the JSON path mirrors each branch's code.
  if (wantsJson()) {
    const known = knownPatternLangs(claudeDir);
    const unknown = !!(lang && known.length && !known.includes(lang));
    const cached = lang ? langs.includes(lang) : langs.length > 0;
    emitJson(
      {
        lang: lang || null,
        cached,
        unknown_language: unknown,
        patterns_dir: patternsDir(claudeDir),
        patterns: patternEntries(claudeDir),
        known_languages: known,
      },
      unknown ? 2 : cached ? 0 : 1
    );
  }
  // A key the payload has never heard of is a CALLER bug, not an absent cache
  // (v0.34.8). The probe used to glob `<lang>-pattern.md` and answer for any
  // string, so a gate asking about `js` — a file extension, not one of the
  // FRAMEWORK keys in INDEX.md — got a clean "absent", fell back correctly, and
  // looked like a lane defect. Exit 2 keeps 0/1 meaning cached/absent.
  const known = knownPatternLangs(claudeDir);
  if (lang && known.length && !known.includes(lang)) {
    console.log(
      `✗ unknown language key "${lang}" — not a row in orc-pattern/references/INDEX.md.\n` +
        `  Keys are FRAMEWORK names, not file extensions: ${known.join(", ")}.\n` +
        "  (Register a new language by adding its row + playbook, then re-run.)"
    );
    process.exit(2);
  }
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
  // No-argument form obeys the same contract (v0.34.7): an EMPTY cache is the
  // absent state, so it exits 1 too — it used to exit 0, which is the mirror
  // image of the `orc diy status` bug and equally unbranchable.
  if (!langs.length) {
    console.log("no cached patterns — run `/orc-pattern` in Claude Code to codify your conventions");
    process.exit(1);
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

// ── Gotchas (repair memory — v0.40.0) ──────────────────────────────────────
// A gotcha is ONE project-specific failure a repair already solved. The live
// file sits BESIDE the pattern cache (a sibling of orc/patterns/, never inside
// it, so listPatternLangs() can never see it) and — like every other file ORC
// generates under .claude/orc/ — is absent from the install manifest, so
// `orc update --prune` can never delete it and `orc update` never overwrites it.
//
// Division of labour: the MODEL returns an entry body via `gotcha_recorded`, the
// ORCHESTRATOR appends it, and this CLI owns counting, capping and archival.
// Eviction is an ARCHIVE, never a delete — a gotcha that stopped being true is
// the user's to remove, and capacity is not correctness.
function gotchasPath(claudeDir) {
  return path.join(claudeDir, "orc", "gotchas.md");
}
function gotchasArchivePath(claudeDir) {
  return path.join(claudeDir, "orc", "gotchas-archive.md");
}

// Split a gotchas file into whole entry BLOCKS. The heading is the identity:
// `## G-<3-digit id> · <lang-or-area> · <kind>`; every field line follows it
// until the next heading. Anything before the first heading is a file preamble
// and is preserved separately.
const GOTCHA_HEAD = /^##\s+(G-\d{3})\s+·\s+([^·]+?)\s+·\s+(repair|drift|review|verify)\s*$/;

function parseGotchas(file) {
  if (!fs.existsSync(file)) return { preamble: "", entries: [] };
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
  const entries = [];
  const pre = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(GOTCHA_HEAD);
    if (m) {
      if (cur) entries.push(cur);
      cur = { id: m[1], area: m[2].trim(), kind: m[3], lines: [line], fields: {} };
      continue;
    }
    if (!cur) {
      pre.push(line);
      continue;
    }
    cur.lines.push(line);
    const f = line.match(/^-\s+([a-z_]+):\s*(.*)$/);
    if (f) cur.fields[f[1]] = f[2].trim();
  }
  if (cur) entries.push(cur);
  for (const e of entries) {
    e.hits = Number.parseInt(e.fields.hits, 10);
    if (!Number.isFinite(e.hits)) e.hits = 0;
    // DD-MM-YYYY (the repo's convention) → a sortable number. Unparseable
    // reads as the OLDEST possible date, so a malformed entry is evicted before
    // a well-formed one rather than outliving it.
    const d = /^(\d{2})-(\d{2})-(\d{4})$/.exec(e.fields.last_seen || "");
    e.seen = d ? Number(d[3] + d[2] + d[1]) : 0;
    e.text = e.lines.join("\n").replace(/\n+$/, "");
  }
  return { preamble: pre.join("\n").replace(/\n+$/, ""), entries };
}

function gotchaRow(e) {
  const trig = e.fields.trigger || "(no trigger recorded)";
  return `  ${e.id} · ${e.area} · ${e.kind} · hits ${e.hits} · ${e.fields.last_seen || "?"}\n      ${trig}`;
}

// Exit code IS the contract, same convention as `orc pattern status <lang>` and
// `orc diy status`: 0 = one or more live entries, 1 = none. A gate branches on
// the code without parsing prose.
function gotchaStatus(claudeDir, verbose) {
  const file = gotchasPath(claudeDir);
  const { entries } = parseGotchas(file);
  if (wantsJson()) {
    emitJson(
      {
        file,
        count: entries.length,
        gotchas: entries.map((e) => ({
          id: e.id,
          area: e.area,
          kind: e.kind,
          hits: e.hits,
          last_seen: e.fields.last_seen || null,
          trigger: e.fields.trigger || null,
          fields: e.fields,
        })),
      },
      entries.length ? 0 : 1
    );
  }
  if (!entries.length) {
    console.log("no gotchas recorded yet — nothing to inject (a repair loop that goes red → green writes the first one)");
    process.exit(1);
  }
  console.log(`✓ ${plural(entries.length, "gotcha")} — ${file}`);
  if (verbose) for (const e of entries) console.log(gotchaRow(e));
  process.exit(0);
}

// Archive the LOW-VALUE tail down to gotchas_max: fewest hits first, then
// oldest last_seen. Whole blocks are APPENDED to gotchas-archive.md — never
// dropped, so an eviction is always recoverable.
function gotchaPrune(claudeDir) {
  const file = gotchasPath(claudeDir);
  const { preamble, entries } = parseGotchas(file);
  // Same resolution every other command uses: the CONFIG_META default, with the
  // user override on top.
  const ovr = readOverride(claudeDir).map;
  const max =
    Number(
      Object.prototype.hasOwnProperty.call(ovr, "gotchas_max")
        ? ovr.gotchas_max
        : metaFor("gotchas_max").def
    ) || 40;
  if (!entries.length) {
    console.log("no gotchas recorded yet — nothing to prune");
    return;
  }
  if (entries.length <= max) {
    console.log(`✓ ${plural(entries.length, "gotcha")} — within gotchas_max (${max}); nothing archived`);
    return;
  }
  const ranked = [...entries].sort((a, b) => a.hits - b.hits || a.seen - b.seen);
  const evictIds = new Set(ranked.slice(0, entries.length - max).map((e) => e.id));
  const evicted = entries.filter((e) => evictIds.has(e.id));
  const kept = entries.filter((e) => !evictIds.has(e.id));

  const archive = gotchasArchivePath(claudeDir);
  const head = fs.existsSync(archive)
    ? ""
    : "# Gotchas — archive\n\nEntries evicted from `gotchas.md` by `orc gotcha prune`. Archived, never\ndeleted: IDs are monotonic and never reused, so an archived gotcha stays\ntraceable. Nothing reads this file at run time.\n";
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.appendFileSync(archive, head + "\n" + evicted.map((e) => e.text).join("\n\n") + "\n");
  fs.writeFileSync(file, (preamble ? preamble + "\n\n" : "") + kept.map((e) => e.text).join("\n\n") + "\n");
  console.log(
    `✓ archived ${plural(evicted.length, "gotcha")} (${[...evictIds].join(", ")}) → ${archive}\n` +
      `  ${plural(kept.length, "live gotcha")} remain (gotchas_max=${max}). Archived, never deleted.`
  );
}

function gotcha() {
  if (flag("--global")) {
    console.error("❌ orc gotcha is project-scoped — the memory is this repo's. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["gotcha", <sub?>]
  switch (pos[1]) {
    case undefined:
    case "status":
      gotchaStatus(claudeDir, false);
      break;
    case "list":
      gotchaStatus(claudeDir, true);
      break;
    case "prune":
      gotchaPrune(claudeDir);
      break;
    default:
      console.error(
        `Unknown: orc gotcha ${pos[1]}\n` +
          "Usage: orc gotcha status | list   whether repair memory exists (exit 0 = entries, 1 = none)\n" +
          "       orc gotcha prune           archive the low-value tail down to gotchas_max"
      );
      process.exit(1);
  }
}

// ── Mock examples (`orc mock …`) ───────────────────────────────────────────
// `mock-examples/<change-slug>/` sits at the PROJECT ROOT and holds EXAMPLE.md
// plus one minimal runnable mocked example, written after a green verify
// (config `mock_example`, default `ask`) and NEVER staged. Until now it had no
// CLI surface at all, so anything wanting to show one had to invent its own
// filesystem logic for a folder whose location is a contract.
//
// Read-only by design, and it never offers to RUN anything: a mock example is
// arbitrary project code, and "here is a Run button" for arbitrary code is a
// promise this command has no business making.
const MOCK_DIR = "mock-examples";
const MOCK_README = "EXAMPLE.md";
// A mock example is small by construction; this cap only stops a stray build
// artifact inside one from being enumerated forever.
const MOCK_MAX_FILES = 200;

function mockRoot(claudeDir) {
  return path.join(repoRootOf(claudeDir), MOCK_DIR);
}

function listMocks(claudeDir) {
  const root = mockRoot(claudeDir);
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (_) {
    return { root, mocks: [] };
  }
  const mocks = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    let mtime = 0;
    try { mtime = fs.statSync(dir).mtimeMs; } catch (_) {}
    mocks.push({
      slug: e.name,
      dir,
      mtime_ms: Math.round(mtime),
      has_readme: fs.existsSync(path.join(dir, MOCK_README)),
    });
  }
  mocks.sort((a, b) => b.mtime_ms - a.mtime_ms);
  return { root, mocks };
}

// Relative file list for ONE mock, with sizes. Never reads the file bodies —
// `mock show` renders EXAMPLE.md; everything else is a listing.
function mockFiles(dir) {
  const out = [];
  const walk = (d, prefix) => {
    if (out.length >= MOCK_MAX_FILES) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= MOCK_MAX_FILES) return;
      const rel = prefix ? prefix + "/" + e.name : e.name;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        walk(path.join(d, e.name), rel);
        continue;
      }
      let size = null;
      try { size = fs.statSync(path.join(d, e.name)).size; } catch (_) {}
      out.push({ path: rel, size });
    }
  };
  walk(dir, "");
  return out;
}

function mockList(claudeDir) {
  const { root, mocks } = listMocks(claudeDir);
  if (wantsJson()) return emitJson({ root, total: mocks.length, mocks });
  if (!mocks.length) {
    // NOT an error state: `mock_example: off` and a declined `ask` are both
    // normal, so an empty list must never read as something missing.
    console.log(
      `No mock examples under ${root}.\n` +
        "  Nothing is wrong — they are written only after a green verify, when\n" +
        "  config `mock_example` is `on` (or you accept the `ask` offer)."
    );
    return;
  }
  console.log(ui.header(`mock examples — ${plural(mocks.length, "example")}`));
  for (const m of mocks)
    console.log(
      `  ${m.slug.padEnd(32)} ${m.has_readme ? ui.color.green(MOCK_README) : ui.color.gray("no " + MOCK_README)}  ` +
        ui.color.gray(relAge(m.mtime_ms))
    );
  console.log("\n" + ui.color.gray(`Details: orc mock show <slug>   ·   never committed (ship excludes ${MOCK_DIR}/)`));
}

function mockShow(claudeDir, slug) {
  const { root, mocks } = listMocks(claudeDir);
  const pick = mocks.find((m) => m.slug === slug);
  if (!pick) {
    if (wantsJson()) emitJson({ root, slug: slug || null, found: false, known: mocks.map((m) => m.slug) }, 1);
    console.error(
      slug ? `No mock example named "${slug}".` : "Usage: orc mock show <slug>"
    );
    if (mocks.length) console.error("  known: " + mocks.map((m) => m.slug).join(", "));
    process.exit(1);
  }
  const readmePath = path.join(pick.dir, MOCK_README);
  let readme = null;
  try { readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, "utf8") : null; } catch (_) {}
  const files = mockFiles(pick.dir);
  if (wantsJson())
    return emitJson({
      root,
      slug: pick.slug,
      found: true,
      dir: pick.dir,
      mtime_ms: pick.mtime_ms,
      readme,
      readme_path: readme === null ? null : readmePath,
      files,
      truncated: files.length >= MOCK_MAX_FILES,
    });
  console.log(ui.header(`mock example — ${pick.slug}`));
  console.log(ui.kv([["folder", pick.dir], ["files", String(files.length)], ["written", relAge(pick.mtime_ms)]]));
  if (readme) {
    console.log(ui.header(MOCK_README));
    console.log(readme.trimEnd());
  } else console.log(ui.color.gray(`\n(no ${MOCK_README} in this folder)`));
  console.log(ui.header("files"));
  for (const f of files) console.log(`  ${f.path}`);
}

function mock() {
  if (flag("--global")) {
    console.error("❌ orc mock is project-scoped — mock examples live in the repo. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["mock", <sub?>, <slug?>]
  switch (pos[1]) {
    case undefined:
    case "list":
      mockList(claudeDir);
      break;
    case "show":
      mockShow(claudeDir, pos[2]);
      break;
    default:
      console.error(
        `Unknown: orc mock ${pos[1]}\n` +
          "Usage: orc mock list [--json]        every mock-examples/<slug>/, newest first\n" +
          "       orc mock show <slug> [--json] EXAMPLE.md + the file tree (read-only; never runs it)"
      );
      process.exit(1);
  }
}

// ── Mocked runs (`orc mock-run …`) ─────────────────────────────────────────
// The written walkthroughs that ship WITH THIS PACKAGE — one per lane: what you
// type, what ORC prints back, what lands on disk. Nothing was executed to make
// them; they are documentation, and the point is that nobody should have to
// spend tokens to find out what a lane looks like.
//
// NOT `orc mock`, one screen up: that lists the runnable `mock-examples/<slug>/`
// folders a green verify left in YOUR project. This one is package content —
// identical on every machine, needs no `.claude/`, and therefore takes no
// --global/--dir target (it accepts and ignores them, because `orc ui` appends
// --dir to every read it makes).
//
// The catalogue itself is DERIVED in bin/mockrun-catalog.js — a new .md file in
// mock-run/ appears here by itself.
function mockRunList() {
  const cat = require("./mockrun-catalog.js").catalogue();
  if (wantsJson()) return emitJson(cat);
  if (!cat.total) {
    console.error("No mocked runs found in this install — mock-run/ is missing from the package.");
    process.exit(1);
  }
  console.log(ui.header(`mocked runs — ${plural(cat.total, "document")} that ship with ORC`));
  for (const g of cat.groups) {
    console.log("\n" + ui.color.bold(g.title));
    for (const d of g.docs) {
      const tag = d.kind === "annotated" ? ui.color.gray(" (annotated)") : "";
      console.log(`  ${d.slug.padEnd(26)} ${d.summary.slice(0, 62)}${tag}`);
    }
  }
  console.log(
    "\n" +
      ui.color.gray("Read one:  orc mock-run show <slug>   ·   or open the panel:  orc ui  ▸ Mocked Skill Use")
  );
}

function mockRunShow(slug) {
  const catalog = require("./mockrun-catalog.js");
  const doc = slug ? catalog.get(slug) : null;
  if (!doc) {
    const known = catalog.list().map((d) => d.slug);
    if (wantsJson()) emitJson({ slug: slug || null, found: false, known }, 1);
    console.error(slug ? `No mocked run named "${slug}".` : "Usage: orc mock-run show <slug>");
    console.error("  known: " + known.join(", "));
    process.exit(1);
  }
  if (wantsJson()) return emitJson({ ...doc, found: true });
  console.log(ui.header(doc.title));
  console.log(ui.color.gray(`${doc.path}  ·  ${doc.lines} lines` + (doc.lane ? `  ·  ${doc.lane}` : "")));
  console.log("\n" + doc.body.trimEnd());
}

function mockRun() {
  const pos = positionals(); // ["mock-run", <sub?>, <slug?>]
  switch (pos[1]) {
    case undefined:
    case "list":
      mockRunList();
      break;
    case "show":
      mockRunShow(pos[2]);
      break;
    default:
      // A bare `orc mock-run <slug>` is what people type — treat it as `show`
      // rather than an error, since no slug can collide with `list`/`show`.
      mockRunShow(pos[1]);
  }
}

// ── Stacked PRs (`orc pr stack …`) ─────────────────────────────────────────
// The skeleton generator + the existence probe for stacked-pr/<slug>/stack-plan.md.
// WHY a CLI command and not a skill step: the plan is the CONTRACT between
// orc-pr-setup (planner) and orc-pr-driver (driver), and a user must be able to
// start at the DRIVER with a hand-written plan — no planner run, no model call.
// Deterministic file + deterministic probe, same as `orc pattern status`.
const STACK_DIR = "stacked-pr";
const STACK_PLAN_FILE = "stack-plan.md";

function stackPaths(claudeDir, slug) {
  const root = path.join(repoRootOf(claudeDir), STACK_DIR);
  return { root, dir: path.join(root, slug), plan: path.join(root, slug, STACK_PLAN_FILE) };
}

// Every slug under stacked-pr/ that actually holds a plan file.
function listStackSlugs(claudeDir) {
  const root = path.join(repoRootOf(claudeDir), STACK_DIR);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, STACK_PLAN_FILE)))
    .map((e) => e.name)
    .sort();
}

function stackTemplateBody(slug) {
  return `# Stack plan: <feature>

<!--
  SKELETON — fill every <...> in, then run \`/orc-pr-driver\` (no planner run needed).
  Unsure where a cut line goes? Run \`/orc-pr-setup\` instead: it asks you, one
  decision at a time, and writes this file for you.
  Contract + budget rules: .claude/skills/_shared/stack-plan.md
  A remaining <...> placeholder means \`orc pr stack status\` reports NOT READY.
-->

- ticket: <TICKET-123>
- repo: <owner/name>
- trunk: <main>
- entry mode: <greenfield | orc-run>
- pr template: <orc | project:.github/pull_request_template.md | claude.md | picked:context-first>
- totals: <n> LoC · <n> files · <n> layers

## Layers

| # | branch | purpose (1 line) | value class | files | LoC | depends on | build-alone? |
|---|--------|------------------|-------------|-------|-----|------------|--------------|
| 1 | <ticket>-<slug>-<layer> | <why this layer exists> | <FOUNDATION> | <n> | <n> | — | <yes> |
| 2 | <ticket>-<slug>-<layer> | <why this layer exists> | <CONTRACT> | <n> | <n> | 1 | <yes> |

## Layer 1 — <title>

- Purpose: <one line — no purpose means it is not a layer>
- Value class: <USER | OPERATOR | CONTRACT | FOUNDATION — FOUNDATION must name its consumer layer>
- Files: <explicit list, one path per entry, no globs>
- Excluded-from-budget files: <generated/lockfiles/vendored — listed, uncounted>
- Deliberately NOT here: <what a reviewer might expect> → layer <m>
- Green-gate commands: build \`<cmd>\` · tests \`<cmd>\` · lint \`<cmd> --new-from-rev <this layer's base>\`
- Gate status: NOT RUN
- Risk / rollback: <one line>

## Layer 2 — <title>

- Purpose: <one line>
- Value class: <class>
- Files: <explicit list>
- Excluded-from-budget files: <none>
- Deliberately NOT here: <...> → layer <m>
- Green-gate commands: build \`<cmd>\` · tests \`<cmd>\` · lint \`<cmd> --new-from-rev <this layer's base>\`
- Gate status: NOT RUN
- Risk / rollback: <one line>

## Decisions

<every boundary you were unsure about: the options, what you chose, why. The
driver refuses to run while an UNCERTAIN here has no answer.>

## Accepted exceptions

<over-budget layers, oversize atoms, FOUNDATION chains, layer-cap overrides — or "none">
`;
}

function stackTemplate(claudeDir, slugArg) {
  const raw = slugArg || "stack";
  const v = vSlug(raw);
  if (v.err) {
    console.error(`❌ slug ${v.err}`);
    process.exit(1);
  }
  const slug = v.value;
  const p = stackPaths(claudeDir, slug);
  if (fs.existsSync(p.plan) && !flag("--force")) {
    console.error(
      `❌ ${STACK_DIR}/${slug}/${STACK_PLAN_FILE} already exists — refusing to overwrite a plan.\n` +
        `   Edit it, pick another slug (\`orc pr stack template <slug>\`), or pass --force.`
    );
    process.exit(1);
  }
  fs.mkdirSync(p.dir, { recursive: true });
  fs.writeFileSync(p.plan, stackTemplateBody(slug));
  console.log(
    `✓ wrote ${STACK_DIR}/${slug}/${STACK_PLAN_FILE}\n\n` +
      "Next:\n" +
      "  1. fill in every <...> (2+ layers, a ticket, a purpose + value class per layer)\n" +
      `  2. \`orc pr stack status ${slug}\`   → exit 0 when it is READY\n` +
      "  3. `/orc-pr-driver`                → branches, per-layer green gate, gh stack submit\n\n" +
      "Unsure where the cut lines go? Run `/orc-pr-setup` — it asks you and writes this file."
  );
}

// Exit code IS the contract (same convention as `orc pattern status` /
// `orc diy status`): 0 = READY, 1 = absent | unfilled. A driver branches on it
// without parsing prose.
// Every readiness check `stackStatus` makes, as data — so the JSON path answers
// the ambiguous cases (no plans, several plans) with an object instead of the
// prose branch, while keeping the 0 ready / 1 not-ready exit contract.
function stackProbe(claudeDir, slug) {
  const p = stackPaths(claudeDir, slug);
  if (!fs.existsSync(p.plan)) return { slug, ready: false, plan_path: p.plan, exists: false, problems: ["absent"] };
  const text = fs.readFileSync(p.plan, "utf8");
  const problems = [];
  const holes = [...text.matchAll(/<[^<>\n]{2,60}>/g)].map((m) => m[0]);
  if (holes.length)
    problems.push(`${plural(holes.length, "unfilled placeholder")} (e.g. ${[...new Set(holes)].slice(0, 5).join(" ")})`);
  const ticket = /^-\s*ticket:\s*(.+)$/m.exec(text);
  if (!ticket || !ticket[1].trim()) problems.push("no ticket");
  const layers = [...text.matchAll(/^##\s+Layer\s+\d+\b/gm)].length;
  if (layers < 2) problems.push(`${layers} layer section(s) — a stack needs 2+`);
  if (!/^##\s+Decisions\s*$/m.test(text)) problems.push("no `## Decisions` section");
  return {
    slug,
    ready: problems.length === 0,
    exists: true,
    plan_path: p.plan,
    layers,
    ticket: ticket ? ticket[1].trim() : null,
    problems,
  };
}

function stackStatus(claudeDir, slugArg) {
  const slugs = listStackSlugs(claudeDir);
  if (wantsJson()) {
    const slug = slugArg || (slugs.length === 1 ? slugs[0] : null);
    const probe = slug ? stackProbe(claudeDir, slug) : null;
    emitJson(
      { slugs, slug, ambiguous: !slug && slugs.length > 1, plan: probe },
      probe && probe.ready ? 0 : 1
    );
  }
  let slug = slugArg;
  if (!slug) {
    if (!slugs.length) {
      console.log(
        `✗ no stack plan — no ${STACK_DIR}/<slug>/${STACK_PLAN_FILE}\n` +
          "  `orc pr stack template <slug>` writes a skeleton to fill in, or run `/orc-pr-setup`."
      );
      process.exit(1);
    }
    if (slugs.length > 1) {
      console.log(
        `✗ ${slugs.length} stack plans — name one: ${slugs.join(", ")}\n` +
          "  e.g. `orc pr stack status " + slugs[0] + "`"
      );
      process.exit(1);
    }
    slug = slugs[0];
  }
  const p = stackPaths(claudeDir, slug);
  if (!fs.existsSync(p.plan)) {
    console.log(
      `✗ absent — no ${STACK_DIR}/${slug}/${STACK_PLAN_FILE}` +
        (slugs.length ? `\n  known plans: ${slugs.join(", ")}` : "")
    );
    process.exit(1);
  }
  const text = fs.readFileSync(p.plan, "utf8");
  const problems = [];
  // Unfilled placeholders — the whole reason a hand-filled plan needs a probe.
  const holes = [...text.matchAll(/<[^<>\n]{2,60}>/g)].map((m) => m[0]);
  if (holes.length) {
    const uniq = [...new Set(holes)].slice(0, 5);
    problems.push(`${plural(holes.length, "unfilled placeholder")} (e.g. ${uniq.join(" ")})`);
  }
  const ticket = /^-\s*ticket:\s*(.+)$/m.exec(text);
  if (!ticket || !ticket[1].trim()) problems.push("no ticket");
  // Layer sections: `## Layer <n> — <title>` (the schema's own heading shape).
  const layers = [...text.matchAll(/^##\s+Layer\s+\d+\b/gm)].length;
  if (layers < 2) problems.push(`${layers} layer section(s) — a stack needs 2+`);
  if (!/^##\s+Decisions\s*$/m.test(text)) problems.push("no `## Decisions` section");
  if (problems.length) {
    console.log(
      `✗ NOT READY — ${STACK_DIR}/${slug}/${STACK_PLAN_FILE}\n` +
        problems.map((x) => "  - " + x).join("\n") +
        "\n  Fill it in, or run `/orc-pr-setup` to have the layers planned for you."
    );
    process.exit(1);
  }
  console.log(
    `✓ READY — ${STACK_DIR}/${slug}/${STACK_PLAN_FILE} (${plural(layers, "layer")}, ticket ${ticket[1].trim()})\n` +
      "  Run `/orc-pr-driver` to build + submit the stack."
  );
}

function pr(alias) {
  if (flag("--global")) {
    console.error("❌ orc pr is project-scoped — the stack plan lives in the repo. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals();
  // Two spellings, one behavior: `orc pr stack template [<slug>]` and the flat
  // alias `orc pr-stack-template [<slug>]`.
  if (alias === "pr-stack-template") return stackTemplate(claudeDir, pos[1]);
  if (alias === "pr-stack-status") return stackStatus(claudeDir, pos[1]);
  const usage =
    "Usage: orc pr stack template [<slug>]   write a fill-in stack-plan skeleton\n" +
    "       orc pr stack status [<slug>]     is a plan READY? (exit 0 ready / 1 absent-or-unfilled)\n" +
    "       (aliases: orc pr-stack-template, orc pr-stack-status)";
  if (pos[1] !== "stack") {
    console.error(`Unknown: orc ${pos.slice(1).join(" ") || ""}\n${usage}`);
    process.exit(1);
  }
  switch (pos[2]) {
    case "template":
      stackTemplate(claudeDir, pos[3]);
      break;
    case undefined:
    case "status":
      stackStatus(claudeDir, pos[3]);
      break;
    default:
      console.error(`Unknown: orc pr stack ${pos[2]}\n${usage}`);
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
    case "impact":
      wikiImpact(claudeDir);
      break;
    case "plan":
      wikiPlan(claudeDir);
      break;
    case "debt":
      wikiDebt(claudeDir);
      break;
    case "usage":
      wikiUsageCmd(claudeDir, { rebuild: flag("--rebuild") === true });
      break;
    case undefined:
    case "status":
      wikiStatus(claudeDir, { json: flag("--json") });
      break;
    default:
      console.error(
        `Unknown: orc wiki ${pos[1]}\n` +
          "Usage: orc wiki status [--json]      registration state + computed freshness tier\n" +
          "       orc wiki sync [--check]       rebuild wiki-meta.json + INDEX.md from the docs\n" +
          "       orc wiki impact               commit-scoped delta probe: per-doc CLEAN | TOUCHED |\n" +
          "                                     STRUCTURAL vs scan_commit (exit 0 clean / 2 delta / 3 full)\n" +
          "       orc wiki plan [--json]        RANKED, priced work list — what to refresh, in what\n" +
          "                                     order, for how much (exit 0 none / 1 light / 2 deep / 3 n/a)\n" +
          "       orc wiki debt [--json]        one-line pending-refresh summary (exit 0 none / 1 debt)\n" +
          "       orc wiki usage [--rebuild]    which docs runs actually put into a slice"
      );
      process.exit(1);
  }
}

// ── Run state: `orc resume`, `orc run list|show`, `orc stats` (v0.42.0) ─────
// Three read-only commands over state ORC already writes. The design constraint
// shared by all three is SCALE: `log_dir` and `run_dir` are never auto-deleted
// by design, so 100+ runs is a normal working directory, and a command that
// opened every file to build a list would get slower forever. So: enumerate with
// readdir + stat ONLY, sort, then read a bounded HEAD of just the page being
// displayed. `checkpoint.json` is never read for a listing — only `run show`
// opens it.

const RESUME_FILE = "RESUME.md";
const RUN_PAGE_DEFAULT = 20;

// Read at most `bytes` from the front of a file. The listing path never needs
// more than the first few lines, and a run folder can hold a large trace.
function readHead(file, bytes = 4096) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.slice(0, n).toString("utf8");
  } catch (_) {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
  }
}

function relAge(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hours ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

// The ONE line RESUME.md guarantees (references/stop-and-resume.md):
//   Where it stands:  /orc · phase execution · wave 2 of 4 done
// Parsing this is why a listing never has to open checkpoint.json.
function parseStands(text) {
  const m = /^Where it stands:\s*(.+)$/m.exec(text || "");
  const out = { lane: "", phase: "", wave: "" };
  if (!m) return out;
  for (const part of m[1].split("·").map((s) => s.trim())) {
    if (!part) continue;
    if (/^\/?orc/i.test(part) && !out.lane) out.lane = part.startsWith("/") ? part : "/" + part;
    else if (/^phase\b/i.test(part)) out.phase = part.replace(/^phase\s+/i, "");
    else if (/^wave\b/i.test(part)) out.wave = part;
  }
  return out;
}

// Enumerate run folders with stat only. `waiting` == a RESUME.md exists, which
// IS the unfinished flag: ORC deletes that file at FINISH, so there is no
// separate "is this consumed?" bookkeeping to drift out of sync.
function listRuns(claudeDir) {
  const root = resolveRunDir(claudeDir);
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (_) {
    return { root, runs: [] };
  }
  const runs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    let mtime = 0;
    try { mtime = fs.statSync(dir).mtimeMs; } catch (_) {}
    let resumeMtime = null;
    try { resumeMtime = fs.statSync(path.join(dir, RESUME_FILE)).mtimeMs; } catch (_) {}
    runs.push({
      slug: e.name,
      dir,
      mtime,
      resumeMtime,
      waiting: resumeMtime !== null,
      sortKey: resumeMtime !== null ? resumeMtime : mtime,
    });
  }
  runs.sort((a, b) => b.sortKey - a.sortKey);
  return { root, runs };
}

// Status claims only what the disk can PROVE:
//   waiting — RESUME.md exists. Authoritative: ORC writes it at every stop and
//             deletes it at FINISH, so its presence IS "this run is still open".
//   done    — no RESUME.md, but the folder holds something. Either it finished
//             or it never paused; both mean "not waiting for you".
//   empty   — a folder with nothing in it at all.
// What this deliberately does NOT do is infer "finished" from state-of-play.md.
// That file is written at a STOP, so a run that shipped straight through never
// has one, and calling those "incomplete" was a confident lie about real runs.
// Only ever called for the page being displayed — one readdir, no file reads.
function runStatus(run) {
  if (run.waiting) return "waiting";
  try {
    return fs.readdirSync(run.dir).length ? "done" : "empty";
  } catch (_) {
    return "empty";
  }
}

// Best-effort clipboard, zero dependencies: spawn the OS tool if there is one.
// EVERY failure path is non-fatal — a missing tool, a non-TTY, a spawn error.
// The command must never exit non-zero because of the clipboard.
function copyToClipboard(text) {
  const { spawnSync } = require("child_process");
  const candidates =
    process.platform === "win32"
      ? [["clip", []]]
      : process.platform === "darwin"
      ? [["pbcopy", []]]
      : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]]];
  for (const [cmd, argv] of candidates) {
    try {
      const r = spawnSync(cmd, argv, { input: text, windowsHide: true });
      if (!r.error && r.status === 0) return true;
    } catch (_) {}
  }
  return false;
}

function printResumeEntry(run, { clipboard }) {
  const body = fs.readFileSync(path.join(run.dir, RESUME_FILE), "utf8");
  if (clipboard && copyToClipboard(body))
    console.log(ui.color.green("Copied to clipboard.") + " Open a new session and paste it.\n");
  else if (clipboard)
    console.log(ui.color.yellow("Could not reach a clipboard tool") + " — copy the text below by hand.\n");
  const bar = ui.color.gray("─".repeat(40));
  console.log(bar);
  console.log(body.trimEnd());
  console.log(bar);
}

// `orc resume` — the read half of RESUME.md. Replaces nothing: before this,
// the only way back into a paused run was a prompt printed in a chat window
// the user may have closed.
//   orc resume                 numbered picker over every waiting run
//   orc resume <n> | <slug>    skip the picker
//   orc resume --no-clipboard  print only
// Exit codes follow `orc pattern status`: 0 = at least one resume exists (and
// one was printed), 1 = none waiting.
function resume() {
  const claudeDir = resolveClaudeDir();
  const clipboard = flag("--no-clipboard") !== true;
  const { runs } = listRuns(claudeDir);
  const waiting = runs.filter((r) => r.waiting);

  if (!waiting.length) {
    // An empty list is a real answer, not an error condition.
    console.log("No runs are waiting. Everything you started has finished.");
    process.exit(1);
  }

  const rows = waiting.map((r) => {
    const head = readHead(path.join(r.dir, RESUME_FILE)) || "";
    const s = parseStands(head);
    return { ...r, ...s };
  });

  const render = (r, i) =>
    `  ${String(i + 1).padStart(2)}  ${r.slug.padEnd(26)} ${(r.lane || "—").padEnd(10)} ` +
    `${(r.wave || r.phase || "").padEnd(13)} ${ui.color.gray("paused " + relAge(r.resumeMtime))}`;

  const arg = positionals()[1];
  if (arg) {
    const byIndex = /^\d+$/.test(arg) ? rows[Number(arg) - 1] : null;
    const pick = byIndex || rows.find((r) => r.slug === arg);
    if (!pick) {
      console.error(`No waiting run matches "${arg}".`);
      rows.forEach((r, i) => console.error(render(r, i)));
      process.exit(1);
    }
    printResumeEntry(pick, { clipboard });
    return;
  }

  console.log(
    `\n${plural(rows.length, "run")} ${rows.length === 1 ? "is" : "are"} waiting for you.\n`
  );
  rows.forEach((r, i) => console.log(render(r, i)));

  // Same convention as `orc onboarding`: a menu on a TTY, the plain list when
  // piped — so a model or a script reading this never hangs on a prompt.
  if (!process.stdin.isTTY) {
    console.log("\n" + ui.color.gray("Pick one with: orc resume <number|slug>"));
    return;
  }
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("\nPick a number (or q to quit): ", (ans) => {
    rl.close();
    const choice = String(ans).trim().toLowerCase();
    if (!choice || choice === "q") return;
    const pick = rows[Number(choice) - 1];
    if (!pick) {
      console.log("  ? not a valid choice");
      return;
    }
    console.log("");
    printResumeEntry(pick, { clipboard });
  });
}

// `orc run list` / `orc run show <slug|n>`
function runCmd() {
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["run", <sub?>, <arg?>]
  const sub = pos[1] || "list";
  const { root, runs } = listRuns(claudeDir);

  if (sub === "show") {
    const arg = pos[2];
    const pick = /^\d+$/.test(String(arg)) ? runs[Number(arg) - 1] : runs.find((r) => r.slug === arg);
    if (!pick) {
      console.error(arg ? `No run matches "${arg}".` : "Usage: orc run show <slug|number>");
      process.exit(1);
    }
    const readIf = (f) => {
      const p = path.join(pick.dir, f);
      try { return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null; } catch (_) { return null; }
    };
    if (wantsJson()) {
      let checkpoint = null;
      try { checkpoint = JSON.parse(fs.readFileSync(path.join(pick.dir, "checkpoint.json"), "utf8")); } catch (_) {}
      let files = [];
      try { files = fs.readdirSync(pick.dir).sort(); } catch (_) {}
      // The TAIL of this run's behavior trace, resolved from the checkpoint's
      // own `trace_path`. JSON-only on purpose: dumping a 20-minute trace into
      // the terminal report would bury the state-of-play it exists to show,
      // while a caller rendering the run has nowhere else to get it (traces
      // are not addressable by run slug).
      let trace = null;
      let tracePath = null;
      if (checkpoint && checkpoint.trace_path) {
        const rel = String(checkpoint.trace_path);
        tracePath = path.isAbsolute(rel) ? rel : path.join(repoRootOf(claudeDir), rel);
        if (fs.existsSync(tracePath)) trace = readTail(tracePath, 24576);
        else tracePath = null;
      }
      emitJson({
        slug: pick.slug,
        dir: pick.dir,
        status: runStatus(pick),
        updated_ms: Math.round(pick.sortKey),
        // The parsed one-liner RESUME.md guarantees, so a caller gets the
        // lane/phase/wave without re-implementing the parser.
        stands: parseStands(readHead(path.join(pick.dir, pick.waiting ? RESUME_FILE : "state-of-play.md")) || ""),
        resume: readIf(RESUME_FILE),
        state_of_play: readIf("state-of-play.md"),
        checkpoint,
        trace_path: tracePath,
        trace,
        files,
      });
      return;
    }
    console.log(ui.header(`run ${pick.slug}`));
    console.log(ui.kv([["status", runStatus(pick)], ["folder", pick.dir], ["updated", relAge(pick.sortKey)]]));
    for (const [label, file] of [
      ["state-of-play", "state-of-play.md"],
      ["resume", RESUME_FILE],
    ]) {
      const p = path.join(pick.dir, file);
      if (!fs.existsSync(p)) continue;
      console.log(ui.header(label));
      console.log(fs.readFileSync(p, "utf8").trimEnd());
    }
    // `run show` is the ONLY path allowed to open the checkpoint.
    const ck = path.join(pick.dir, "checkpoint.json");
    if (fs.existsSync(ck)) {
      try {
        const j = JSON.parse(fs.readFileSync(ck, "utf8"));
        console.log(ui.header("checkpoint"));
        console.log(
          ui.kv([
            ["phase", String(j.phase ?? "—")],
            ["wave", String(j.wave ?? "—")],
            ["updated_at", String(j.updated_at ?? "—")],
            ["trace", String(j.trace_path ?? "—")],
          ])
        );
      } catch (_) {
        console.log(ui.color.gray("\n(checkpoint.json is present but unreadable)"));
      }
    }
    return;
  }

  if (sub !== "list") {
    console.error(`Unknown subcommand: orc run ${sub}\nTry: orc run list | orc run show <slug|n>`);
    process.exit(1);
  }

  const asJson = wantsJson();
  if (!runs.length) {
    // "No runs" is a SUCCESS answer, so --json must still return the object.
    if (asJson) return emitJson({ run_dir: root, total: 0, shown: 0, runs: [] });
    console.log(`No runs recorded yet under ${root}.`);
    return;
  }

  const all = flag("--all") === true;
  const limitFlag = Number(flag("--limit"));
  const limit = all ? runs.length : Number.isFinite(limitFlag) && limitFlag > 0 ? limitFlag : RUN_PAGE_DEFAULT;
  const page = runs.slice(0, limit);

  // The status probe and the head read happen HERE — only for the page being
  // displayed, so a 200-run folder costs the same as a 20-run one.
  for (const r of page) {
    r.status = runStatus(r);
    const src = r.waiting ? RESUME_FILE : "state-of-play.md";
    Object.assign(r, parseStands(readHead(path.join(r.dir, src)) || ""));
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          run_dir: root,
          total: runs.length,
          shown: page.length,
          runs: page.map((r) => ({
            slug: r.slug,
            status: r.status,
            lane: r.lane || null,
            phase: r.phase || null,
            wave: r.wave || null,
            updated_ms: Math.round(r.sortKey),
          })),
        },
        null,
        2
      )
    );
    return;
  }

  console.log(ui.header(`orc runs — ${runs.length} total`));
  page.forEach((r, i) => {
    const badge =
      r.status === "waiting"
        ? ui.color.yellow("waiting")
        : r.status === "done"
        ? ui.color.green("done   ")
        : ui.color.gray("empty  ");
    console.log(
      `  ${String(i + 1).padStart(3)}  ${badge}  ${r.slug.padEnd(30)} ` +
        `${(r.lane || "").padEnd(9)} ${(r.wave || r.phase || "").padEnd(13)} ` +
        ui.color.gray(relAge(r.sortKey))
    );
  });
  if (page.length < runs.length)
    console.log(
      "\n" + ui.color.gray(`showing 1-${page.length} of ${runs.length} — --limit <n> for more, --all for everything`)
    );
  console.log(
    "\n" +
      ui.color.gray(
        "waiting = a resume pointer is on disk · done = no pointer (finished, or never paused)\n" +
          "Runs from before v0.42.0 wrote no pointer, so they all read `done`.\n" +
          "Details: orc run show <slug|number>   ·   Resume one: orc resume"
      )
  );
}

// ── orc stats — deterministic usage counting (no model, no cost) ────────────
// Source: the trace files that already exist. Their names are DATA
// (`run-<lane>-<slug>-<DDMMYY>-<HHMMSS>.txt`), so lane and date come from the
// filename with zero parsing and the headline counts are free. Depth comes from
// the single `STATS` line each run appends at FINISH; traces older than v0.42.0
// have no such line and fall back to counting `DISPATCH` lines, which are
// orchestrator-written and present in every lane.
const TRACE_NAME = /^run-([a-z0-9]+)-(.+)-(\d{6})-(\d{6})\.txt$/;
const TRACE_GENERIC = /^run-(\d{6})-(\d{6})\.txt$/;

function resolveLogDir(claudeDir) {
  let rel = ".claude/orc/logs";
  try {
    rel = readOverride(claudeDir).map.log_dir || rel;
  } catch (_) {}
  return path.isAbsolute(rel) ? rel : path.join(claudeDir, "..", rel);
}

// DDMMYY (the trace filename's own stamp) → a comparable YYYY-MM-DD.
function traceDateIso(ddmmyy) {
  const dd = ddmmyy.slice(0, 2), mm = ddmmyy.slice(2, 4), yy = ddmmyy.slice(4, 6);
  return `20${yy}-${mm}-${dd}`;
}

// Read the tail of a file — the STATS line is appended at FINISH, so it is at
// the end. Never parse a 20-minute trace to count one run.
function readTail(file, bytes = 8192) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(Math.min(bytes, size));
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString("utf8");
  } catch (_) {
    return "";
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
  }
}

// Parses the run summary the orchestrator appends at FINISH, e.g.
//   [080826 12:00:00.000] orc  STATS lane=orc slug=merchant-notifications \
//        dispatches=17 waves=4 tasks=7 bands=high:2,med:3,low:1 downgrades=0
// Contract copy lives in templates/skills/orc/references/trace-protocol.md.
function parseStatsLine(text) {
  const m = /^.*\bSTATS\s+(.+)$/m.exec(text || "");
  if (!m) return null;
  const out = {};
  for (const kv of m[1].trim().split(/\s+/)) {
    const eq = kv.indexOf("=");
    if (eq > 0) out[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
  return out;
}

function bar(n, max, width = 12) {
  if (!max) return "";
  return "█".repeat(Math.max(1, Math.round((n / max) * width)));
}

function stats() {
  const claudeDir = resolveClaudeDir();
  const dir = resolveLogDir(claudeDir);
  const asJson = flag("--json") === true;
  const since = flag("--since");

  // "No traces" is a real answer, not a failure — so --json still returns the
  // object (with the same exit 1 the human path uses). A caller must not have
  // to special-case an empty log dir by parsing prose.
  const empty = (msg) => {
    if (asJson)
      emitJson(
        { log_dir: dir, runs: 0, from: null, to: null, lanes: {}, agents: {}, dispatches: 0, downgrades: 0, unfinished: 0, unknown_lane: 0 },
        1
      );
    console.log(msg);
    process.exit(1);
  };

  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
  } catch (_) {
    empty(`No traces yet under ${dir}. Run any ORC lane and they appear here.`);
  }

  const lanes = new Map();
  const agents = new Map();
  let total = 0, dispatches = 0, downgrades = 0, unfinished = 0, unknownLane = 0;
  let firstDate = null, lastDate = null;

  for (const name of names) {
    const m = TRACE_NAME.exec(name);
    const g = m ? null : TRACE_GENERIC.exec(name);
    if (!m && !g) continue;
    const date = traceDateIso(m ? m[3] : g[1]);
    // --since filters on the FILENAME date, before any file is opened.
    if (typeof since === "string" && since && date < since) continue;

    const lane = m ? m[1] : "unknown";
    if (!m) unknownLane++;
    total++;
    lanes.set(lane, (lanes.get(lane) || 0) + 1);
    if (!firstDate || date < firstDate) firstDate = date;
    if (!lastDate || date > lastDate) lastDate = date;

    const tail = readTail(path.join(dir, name));
    const st = parseStatsLine(tail);
    if (st) {
      dispatches += Number(st.dispatches) || 0;
      downgrades += Number(st.downgrades) || 0;
    } else {
      // Legacy fallback: count DISPATCH lines. Cheaper detail, same headline.
      const body = fs.readFileSync(path.join(dir, name), "utf8");
      dispatches += (body.match(/\bDISPATCH\s+\S/g) || []).length;
      downgrades += (body.match(/⛔ DOWNGRADE/g) || []).length;
      for (const a of body.match(/\bDISPATCH\s+(orc-[\w.-]+)/g) || []) {
        const key = a.replace(/^\S+\s+/, "").replace(/-(haiku|sonnet|opus|fable)-.*$/, "");
        agents.set(key, (agents.get(key) || 0) + 1);
      }
    }
    if (st) {
      for (const a of tail.match(/\bDISPATCH\s+(orc-[\w.-]+)/g) || []) {
        const key = a.replace(/^\S+\s+/, "").replace(/-(haiku|sonnet|opus|fable)-.*$/, "");
        agents.set(key, (agents.get(key) || 0) + 1);
      }
    }
    if (!/\bFINISH\b/.test(tail)) unfinished++;
  }

  if (!total) empty(since ? `No traces on or after ${since}.` : `No traces yet under ${dir}.`);

  const laneRows = [...lanes.entries()].sort((a, b) => b[1] - a[1]);
  const agentRows = [...agents.entries()].sort((a, b) => b[1] - a[1]);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          log_dir: dir,
          runs: total,
          from: firstDate,
          to: lastDate,
          lanes: Object.fromEntries(laneRows),
          agents: Object.fromEntries(agentRows),
          dispatches,
          downgrades,
          unfinished,
          unknown_lane: unknownLane,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(ui.header(`ORC usage — ${plural(total, "run")}, ${firstDate} to ${lastDate}`));
  console.log("\n" + ui.color.bold("Lanes"));
  const maxLane = laneRows[0][1];
  for (const [lane, n] of laneRows) {
    const pct = Math.round((n / total) * 100);
    // `unknown` is not a lane — it is a trace whose name carries no lane at all
    // (a pre-v0.34.2 hook bootstrap). Never print it as if it were a command.
    const label = lane === "unknown" ? ui.color.gray("(no lane)") : "/" + lane;
    console.log(
      `  ${label.padEnd(lane === "unknown" ? 14 + (ui.useColor ? 9 : 0) : 14)} ${String(n).padStart(3)} ` +
        `${n === 1 ? "run " : "runs"}   ${bar(n, maxLane).padEnd(13)} (${pct}%)`
    );
  }
  if (agentRows.length) {
    console.log("\n" + ui.color.bold("Subagents dispatched") + `          ${dispatches} total`);
    for (const [a, n] of agentRows.slice(0, 8))
      console.log(`  ${a.replace(/^orc-/, "").padEnd(28)} ${String(n).padStart(3)}`);
  }
  console.log("\n" + ui.color.bold("Health"));
  console.log(ui.kv([
    ["model downgrades", String(downgrades)],
    ["runs that never finished", `${unfinished}${unfinished ? "   (see `orc resume`)" : ""}`],
    ...(unknownLane ? [["traces with no lane in the name", `${unknownLane}   (pre-v0.34.2 bootstrap files)`]] : []),
  ]));
  console.log(
    "\n" +
      ui.color.gray(
        "Counts only what traces record. `/orc-retro` and `/orc-explain` never write one,\n" +
          "so they never appear here. Deleting or moving log_dir resets these numbers;\n" +
          "nothing auto-prunes traces."
      )
  );
}

// ── Resolved config (defaults + the user override, one place) ────────────────
// Several v0.46.0 commands need the EFFECTIVE value of a handful of keys, and
// each of them reaching into readOverride with its own fallback literal is how
// a default drifts. CONFIG_META is the default table; the override wins.
function resolvedConfig(claudeDir) {
  const out = {};
  for (const m of CONFIG_META) out[m.key] = m.def;
  let map = {};
  try {
    map = readOverride(claudeDir).map;
  } catch (_) {}
  for (const k of Object.keys(map)) out[k] = map[k];
  return out;
}

const isTrue = (v) => String(v) === "true";

// ── /orc-budget (v0.46.0) — the token vector, and four honest views of it ────
//
// Account-level burn tracking is a solved problem. What nobody can answer is:
// given THIS plan — 14 tasks, 4 waves, top score 78 — what will it burn, and
// what does each lane burn instead? ORC can, because ORC composes the slice and
// knows the band of every task before it dispatches.
//
// TOKENS ARE THE UNIT OF TRUTH; usd/quota/context are DERIVED FROM the vector,
// never stored beside it. The four kinds are kept separate everywhere because
// they price and behave completely differently — cache reads are usually the
// LARGEST count and the cheapest per token, so a blended headline hides
// whichever component is about to bite you.
//
// THE JOIN IS THE MOAT: the Claude Code transcripts give the COST (four token
// counts, model, effort, isSidechain, timestamp); ORC's own traces give the
// MEANING (task, score, band, expected model, requeues, wiki use). Neither is
// enough alone, and nobody else has the right-hand column.

const VEC_KINDS = ["input", "cache_write", "cache_read", "output"];
// The weighted-token equivalent: only CACHE READS are discounted (0.1x), which is
// what makes the number comparable to a raw count without pretending output is
// cheap. Reported ALONGSIDE the raw total, never instead of it — raw is what
// fills a context window and a rate limit; weighted is what fills an invoice.
const CACHE_READ_WEIGHT = 0.1;
const weightedTokens = (v) =>
  (v.input || 0) + (v.cache_write || 0) + (v.cache_read || 0) * CACHE_READ_WEIGHT + (v.output || 0);
const rawTokens = (v) => VEC_KINDS.reduce((n, k) => n + (v[k] || 0), 0);
const kTok = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n));

const PRICE_STALE_DAYS = 90;
const PRICING_DEFAULT = path.join(__dirname, "pricing.json");

function readPricing(claudeDir) {
  const cfg = resolvedConfig(claudeDir);
  let p = PRICING_DEFAULT;
  const custom = String(cfg.budget_price_table || "").trim();
  if (custom) p = path.isAbsolute(custom) ? custom : path.join(repoRootOf(claudeDir), custom);
  try {
    const t = JSON.parse(fs.readFileSync(p, "utf8"));
    t._path = p;
    const asOf = Date.parse(String(t.as_of || "") + "T00:00:00Z");
    t._age_days = isNaN(asOf) ? null : Math.floor((Date.now() - asOf) / 86400000);
    t._stale = t._age_days === null || t._age_days > PRICE_STALE_DAYS;
    return t;
  } catch (_) {
    return null;
  }
}

const MODEL_FAMILIES = ["opus", "sonnet", "haiku", "fable"];
const EFFORT_WORDS = new Set(["low", "med", "medium", "high", "xhigh", "max"]);

// `orc-executor-opus-4-8-high` → `claude-opus-4-8`. An agent's model lives in its
// NAME by house rule (a model change is always a rename), so this needs no table.
function modelOf(name) {
  if (!name) return null;
  const s = String(name);
  if (s.startsWith("claude-")) return s;
  const parts = s.split("-");
  const i = parts.findIndex((p) => MODEL_FAMILIES.includes(p));
  if (i === -1) return null;
  const rest = parts.slice(i);
  if (EFFORT_WORDS.has(rest[rest.length - 1])) rest.pop();
  return "claude-" + rest.join("-");
}
function effortOf(name) {
  const last = String(name || "").split("-").pop();
  if (!EFFORT_WORDS.has(last)) return null;
  return last === "med" ? "medium" : last;
}

function rateFor(table, model) {
  if (!table) return null;
  const m = String(model || "");
  if (table.models && table.models[m]) return table.models[m];
  const fam = MODEL_FAMILIES.find((f) => m.includes(f));
  if (fam && table.families && table.families[fam]) return table.families[fam];
  return null;
}

// USD + the weighted equivalent for one vector. `hint` is an agent name or a
// model id; a model we have no rate for yields usd: null — NEVER an invented
// price, and never a family guess presented as a figure.
function priceVector(claudeDir, vec, hint) {
  const table = readPricing(claudeDir);
  const rate = rateFor(table, modelOf(hint));
  const usd = rate
    ? (vec.input * rate.input +
        vec.cache_write * rate.cache_write +
        vec.cache_read * rate.cache_read +
        vec.output * rate.output) /
      1e6
    : null;
  return { usd, weighted: weightedTokens(vec), raw: rawTokens(vec), rate, table };
}

// ── the corpus: Claude Code's own JSONL transcripts ──────────────────────────
// Verified shape (every assistant message):
//   "usage": { input_tokens, cache_creation_input_tokens,
//              cache_read_input_tokens, output_tokens,
//              server_tool_use: { web_search_requests, web_fetch_requests } }
// and the LINE carries model, timestamp, cwd, sessionId and isSidechain — which
// is how a subagent dispatch is told apart from the main thread.
function transcriptDir(root) {
  // ORC_TRANSCRIPT_DIR is a TEST seam (same family as ORC_NO_UPDATE_CHECK): the
  // real corpus lives in the user's home and a test must never write there.
  if (process.env.ORC_TRANSCRIPT_DIR) return process.env.ORC_TRANSCRIPT_DIR;
  return path.join(os.homedir(), ".claude", "projects", String(root).replace(/[^A-Za-z0-9]/g, "-"));
}

const CORPUS_MAX_FILES = 80;

function readCorpus(root) {
  const dir = transcriptDir(root);
  let files;
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({ f, at: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.at - a.at)
      .slice(0, CORPUS_MAX_FILES);
  } catch (_) {
    // A missing or unreadable transcript directory is an ANSWER, not a failure:
    // the caller forecasts in TOKENS ONLY from ORC trace metadata and prints
    // "dollars and quota unavailable: no local usage data". Never a price.
    return { dir, ok: false, files: 0, blocks: [], groups: [] };
  }
  const blocks = [];
  for (const { f } of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(dir, f), "utf8");
    } catch (_) {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line || line[0] !== "{") continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch (_) {
        continue;
      }
      const msg = o.message || o;
      const u = msg && msg.usage;
      if (!u || typeof u.output_tokens !== "number") continue;
      const st = u.server_tool_use || {};
      blocks.push({
        file: f,
        session: o.sessionId || null,
        at: Date.parse(o.timestamp || "") || 0,
        cwd: o.cwd || null,
        sidechain: !!o.isSidechain,
        model: msg.model || o.model || null,
        effort: o.effort || msg.effort || null,
        vec: {
          input: u.input_tokens || 0,
          cache_write: u.cache_creation_input_tokens || 0,
          cache_read: u.cache_read_input_tokens || 0,
          output: u.output_tokens || 0,
        },
        web_search: st.web_search_requests || 0,
        web_fetch: st.web_fetch_requests || 0,
      });
    }
  }
  blocks.sort((a, b) => a.at - b.at);
  return { dir, ok: true, files: files.length, blocks, groups: groupSidechains(blocks) };
}

// One subagent dispatch = a CONTIGUOUS run of sidechain messages in one session
// on one model. Grouping is what turns per-message usage into a per-dispatch
// cost that a DISPATCH trace line can be joined to.
function groupSidechains(blocks) {
  const groups = [];
  let cur = null;
  for (const b of blocks) {
    if (!b.sidechain) {
      cur = null;
      continue;
    }
    if (!cur || cur.session !== b.session || cur.model !== b.model || b.at - cur.end > 20 * 60_000) {
      cur = {
        session: b.session,
        model: b.model,
        effort: b.effort,
        cwd: b.cwd,
        start: b.at,
        end: b.at,
        messages: 0,
        vec: { ...ZERO_VEC },
        // Peak CONTEXT for this dispatch: the largest single prompt it sent.
        // This is the input to the context-risk forecast — a run does not only
        // cost money, it can hit compaction, which is invisible in every spend
        // tool and silently degrades quality.
        peak: 0,
        web_search: 0,
        web_fetch: 0,
        claimed: false,
      };
      groups.push(cur);
    }
    cur.end = b.at;
    cur.messages++;
    cur.vec = sumVec(cur.vec, b.vec);
    cur.peak = Math.max(cur.peak, b.vec.input + b.vec.cache_write + b.vec.cache_read);
    cur.web_search += b.web_search;
    cur.web_fetch += b.web_fetch;
  }
  return groups;
}

// ── the ORC side of the join: trace metadata ─────────────────────────────────
const TRACE_TS = /^\[(\d{2})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?\]/;
function traceTs(line) {
  const m = TRACE_TS.exec(line);
  if (!m) return null;
  return new Date(2000 + +m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6], +(m[7] || 0)).getTime();
}

function readTraceMeta(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (_) {
    return null;
  }
  const lines = text.split(/\r?\n/);
  const out = { file, start: null, end: null, dispatches: [], bands: {}, finished: /\bFINISH\b/.test(text) };
  for (const line of lines) {
    const ts = traceTs(line);
    if (ts) {
      if (out.start === null) out.start = ts;
      out.end = ts;
    }
    const d = /\bDISPATCH\s+(orc-[\w.-]+)\s*::\s*([^\n]*?)(?:\s+expect=(\S+))?\s*$/.exec(line);
    if (d) out.dispatches.push({ agent: d[1], task: (d[2] || "").trim(), expect: d[3] || null, at: ts });
    const s = /\bSCORE\s+task=(\S+)\s+score=(\d+)\s+band=(\S+)/.exec(line);
    if (s) out.bands[s[1]] = { score: Number(s[2]), band: s[3] };
    const st = parseStatsLine(line);
    if (st && st.lane) out.stats = st;
  }
  return out;
}

function listTraces(claudeDir) {
  const dir = resolveLogDir(claudeDir);
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
  } catch (_) {
    return { dir, runs: [] };
  }
  const runs = [];
  for (const name of names) {
    const m = TRACE_NAME.exec(name);
    runs.push({
      name,
      lane: m ? m[1] : "unknown",
      slug: m ? m[2] : null,
      date: m ? traceDateIso(m[3]) : null,
      path: path.join(dir, name),
      mtime: (() => {
        try {
          return fs.statSync(path.join(dir, name)).mtimeMs;
        } catch (_) {
          return 0;
        }
      })(),
    });
  }
  runs.sort((a, b) => b.mtime - a.mtime);
  return { dir, runs };
}

// Greedy nearest-in-time join. A sidechain group is claimed by the DISPATCH line
// with the same MODEL whose timestamp is nearest and not after it by more than
// the group's own duration. A group nothing can claim counts into `unattributed`
// — which is ALWAYS printed, never silently dropped.
function joinRun(trace, groups) {
  const out = { rows: [], unattributed: [] };
  if (!trace || trace.start === null) return out;
  const pad = 5 * 60_000;
  const inWindow = groups.filter((g) => !g.claimed && g.start >= trace.start - pad && g.start <= (trace.end || trace.start) + pad);
  for (const d of trace.dispatches) {
    const want = modelOf(d.expect ? d.expect.split("/")[0] : d.agent);
    let best = null;
    for (const g of inWindow) {
      if (g.claimed) continue;
      if (want && g.model && modelOf(g.model) !== want) continue;
      const dist = d.at === null ? 0 : Math.abs(g.start - d.at);
      if (!best || dist < best.dist) best = { g, dist };
    }
    if (!best) {
      out.rows.push({ ...d, group: null });
      continue;
    }
    best.g.claimed = true;
    out.rows.push({ ...d, group: best.g });
  }
  for (const g of inWindow) if (!g.claimed) out.unattributed.push(g);
  return out;
}

// ── calibration: the per-band / per-role rate model ─────────────────────────
const RATES_FILE = "budget-rates.json";
const ratesPath = (claudeDir) => path.join(claudeDir, "orc", RATES_FILE);

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}
function vecPct(samples, p) {
  const out = {};
  for (const k of VEC_KINDS) out[k] = Math.round(pct(samples.map((s) => s[k] || 0).sort((a, b) => a - b), p));
  return out;
}

function calibrate(claudeDir) {
  const root = repoRootOf(claudeDir);
  const corpus = readCorpus(root);
  const { runs } = listTraces(claudeDir);
  const bands = {};
  const roles = {};
  let joined = 0;
  let unattributedBlocks = 0;
  let unattributedVec = { ...ZERO_VEC };
  const laneTotals = {};

  for (const r of runs.slice(0, WIKI_USAGE_RUNS * 3)) {
    const trace = readTraceMeta(r.path);
    if (!trace) continue;
    const j = joinRun(trace, corpus.groups);
    const laneVec = laneTotals[r.lane] || (laneTotals[r.lane] = { runs: 0, vec: { ...ZERO_VEC } });
    laneVec.runs++;
    for (const row of j.rows) {
      if (!row.group) continue;
      joined++;
      laneVec.vec = sumVec(laneVec.vec, row.group.vec);
      const sample = { ...row.group.vec, peak: row.group.peak };
      const role = (roles[row.agent] = roles[row.agent] || { samples: [] });
      role.samples.push(sample);
      // Executors are keyed by BAND (that is the dial the score→model table
      // turns); every other role is keyed by its own name.
      const band = (trace.bands[row.task.split(/\s+/)[0]] || {}).band;
      if (band && /executor/.test(row.agent)) {
        const b = (bands[band] = bands[band] || { samples: [], models: {} });
        b.samples.push(sample);
        b.models[row.agent] = (b.models[row.agent] || 0) + 1;
      }
    }
    for (const g of j.unattributed) {
      unattributedBlocks++;
      unattributedVec = sumVec(unattributedVec, g.vec);
    }
  }

  const finish = (bag) => {
    const out = {};
    for (const [k, v] of Object.entries(bag)) {
      out[k] = {
        samples: v.samples.length,
        p50: vecPct(v.samples, 50),
        p90: vecPct(v.samples, 90),
        peak_p50: Math.round(pct(v.samples.map((s) => s.peak || 0).sort((a, b) => a - b), 50)),
        peak_p90: Math.round(pct(v.samples.map((s) => s.peak || 0).sort((a, b) => a - b), 90)),
      };
      if (v.models) out[k].models = v.models;
    }
    return out;
  };

  const table = readPricing(claudeDir);
  const out = {
    version: 1,
    calibrated_at: fmtStamp(new Date()),
    transcript_dir: corpus.dir,
    transcripts_readable: corpus.ok,
    transcript_files: corpus.files,
    traces_read: Math.min(runs.length, WIKI_USAGE_RUNS * 3),
    dispatches_joined: joined,
    price_table_as_of: table ? table.as_of : null,
    bands: finish(bands),
    roles: finish(roles),
    lanes: Object.fromEntries(
      Object.entries(laneTotals).map(([l, v]) => [l, { runs: v.runs, vec: v.vec, per_run: divVec(v.vec, v.runs) }])
    ),
    // ALWAYS present, including when 0 — a caller must never have to guess
    // whether the number is missing or genuinely zero.
    unattributed: { blocks: unattributedBlocks, tokens: unattributedVec },
  };
  const p = ratesPath(claudeDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
  return out;
}

const divVec = (v, n) => {
  const out = {};
  for (const k of VEC_KINDS) out[k] = n ? Math.round((v[k] || 0) / n) : 0;
  return out;
};

// Read the rate model, building it lazily on a miss. It is a DERIVED cache over
// data already on disk (traces + transcripts), so rebuilding it costs no model
// and no network — which is why `orc wiki plan` can price a refresh on a machine
// that has never run `orc budget calibrate`.
function budgetRates(claudeDir) {
  const p = ratesPath(claudeDir);
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (_) {}
  }
  try {
    return calibrate(claudeDir);
  } catch (_) {
    return null;
  }
}

function budgetScanEstimate(rates, agent) {
  const r = rates && rates.roles && rates.roles[agent];
  if (!r || !r.samples) return null;
  return { p50: r.p50, p90: r.p90, samples: r.samples };
}

// ── the plan reader (forecast input) ─────────────────────────────────────────
// The FIXED formula from references/effort-and-mode.md, mirrored here so the
// forecast computes a real band instead of guessing one. Both copies change
// together — the contract lint pins the formula's tokens into this file.
const FACET_B = (n) => (n <= 1 ? 2 : n <= 3 ? 6 : n <= 5 ? 10 : 15);
const FACET_N = { mechanical: 0, imitate: 8, "new-surface": 18, "novel-algorithm": 30 };
const FACET_L = { none: 0, branching: 8, stateful: 16, algorithmic: 24 };
const FACET_T = { none: 0, "update-existing": 4, "new-tests": 8 };
const FACET_U = { low: 0, medium: 6, high: 12 };
const RISK_FLOOR = 70;

function scoreFromFacets(f, fanIn, fanOut) {
  const raw =
    FACET_B(Number(f.breadth) || 0) +
    (FACET_N[f.novelty] || 0) +
    (FACET_L[f.logic] || 0) +
    (FACET_T[f.test_surface] || 0) +
    5 * Math.min(fanIn, 3) +
    3 * Math.min(fanOut, 3) +
    (FACET_U[f.uncertainty] || 0);
  const floored = f.risk && f.risk.length ? Math.max(raw, RISK_FLOOR) : raw;
  return Math.max(0, Math.min(100, floored));
}

// The resolved score→model table. `opus5_only` outranks everything (3 bands);
// otherwise the default 8-band table. A hand-written `rubric_bands_override` is
// registry-less by design, so the forecast reports it as UNKNOWN rather than
// pretending to resolve it.
const OPUS5_BANDS = [
  [0, 40, "orc-executor-opus-5-low"],
  [40, 80, "orc-executor-opus-5-med"],
  [80, 101, "orc-executor-opus-5-high"],
];
function bandFor(score, cfg) {
  const rows = isTrue(cfg.opus5_only) ? OPUS5_BANDS : DIY_SCORE_TABLE;
  for (const [lo, hi, agent] of rows)
    if (score >= lo && score < hi) return { band: `[${lo},${hi === 101 ? "100]" : hi + ")"}`, agent };
  const last = rows[rows.length - 1];
  return { band: `[${last[0]},100]`, agent: last[2] };
}

const INLINE_LIST = (s) =>
  String(s || "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((x) => x.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

function parsePlanTasks(text) {
  const src = String(text).replace(/\r\n/g, "\n");
  const tasks = [];
  const re = /^(\s*)-\s+id:\s*([A-Za-z0-9_.-]+)\s*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(src))) marks.push({ indent: m[1].length, id: m[2], from: m.index, to: src.length });
  for (let i = 0; i < marks.length; i++) if (marks[i + 1]) marks[i].to = marks[i + 1].from;
  for (const mk of marks) {
    const block = src.slice(mk.from, mk.to);
    const one = (k) => {
      const r = new RegExp("^\\s*" + k + ":\\s*(.*)$", "m").exec(block);
      return r ? r[1].replace(/\s+#.*$/, "").trim() : null;
    };
    // `facets:` is a nested map, so its extent is decided by INDENTATION, not by
    // the next `key:` line — a lookahead for that matches the map's own first
    // child and silently yields an empty block, which scores every task 0.
    const fBlock = (() => {
      const lines = block.split("\n");
      const i = lines.findIndex((l) => /^\s*facets:\s*$/.test(l));
      if (i === -1) return null;
      const base = /^(\s*)/.exec(lines[i])[1].length;
      const out = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j].trim()) continue;
        if (/^(\s*)/.exec(lines[j])[1].length <= base) break;
        out.push(lines[j]);
      }
      return out.join("\n");
    })();
    const fOne = (k) => {
      const r = new RegExp("^\\s*" + k + ":\\s*(.*)$", "m").exec(fBlock);
      return r ? r[1].replace(/\s+#.*$/, "").trim() : null;
    };
    const declared = INLINE_LIST(one("declared_files"));
    tasks.push({
      id: mk.id,
      title: one("title") || "",
      declared_files: declared,
      depends_on: INLINE_LIST(one("depends_on")),
      computed_score: one("computed_score") && /^\d+$/.test(one("computed_score")) ? Number(one("computed_score")) : null,
      override_score: one("override_score") && /^\d+$/.test(one("override_score")) ? Number(one("override_score")) : null,
      facets: fBlock
        ? {
            breadth: fOne("breadth") !== null ? Number(fOne("breadth")) : declared.length,
            novelty: fOne("novelty"),
            logic: fOne("logic"),
            test_surface: fOne("test_surface"),
            risk: INLINE_LIST(fOne("risk")),
            uncertainty: fOne("uncertainty"),
          }
        : null,
    });
  }
  return tasks;
}

// Fixed roles a run dispatches besides executors. Named, not guessed: the
// forecast has to say WHICH roles it priced or the total is unfalsifiable.
const LANE_FIXED_ROLES = {
  orc: ["orc-system-analyst-opus-5-high", "orc-planner-opus-5-med", "orc-reviewer-opus-5-med", "orc-verifier-opus-5-med", "orc-trace-writer-haiku-4-5"],
  ultra: ["orc-advisor-opus-5-xhigh", "orc-system-analyst-opus-5-high", "orc-planner-opus-5-med", "orc-judge-opus-5-xhigh", "orc-reviewer-opus-5-med", "orc-verifier-opus-5-med", "orc-trace-writer-haiku-4-5"],
  mini: ["orc-analyze-mini-sonnet-5-high", "orc-planner-mini-sonnet-5-high", "orc-trace-writer-haiku-4-5"],
  fast: ["orc-trace-writer-haiku-4-5"],
};
const FORECAST_LANES = ["ultra", "orc", "mini", "fast"];
const LANE_CMD = { orc: "/orc", ultra: "/orc-ultra", mini: "/orc-mini", fast: "/orc-fast" };
// orc-mini and orc-fast dispatch ONE executor for the whole request — they do
// not score per task. Rendering a per-band table for either would be a table the
// lane never runs.
const LANE_ONE_EXECUTOR = { mini: "orc-executor-sonnet-5-high", fast: "orc-executor-sonnet-4-6-high" };

function laneForecast(lane, tasks, rates, cfg) {
  const rows = [];
  let low = 0;
  let lowRoles = 0;
  const p50 = { ...ZERO_VEC };
  const p90 = { ...ZERO_VEC };
  const minSamples = Number(cfg.budget_min_samples) || 5;
  const contextRisk = [];

  const grouped = new Map();
  if (LANE_ONE_EXECUTOR[lane]) {
    grouped.set("(one executor)", { agent: LANE_ONE_EXECUTOR[lane], n: 1, tasks: ["(whole request)"] });
  } else {
    for (const t of tasks) {
      const score = t.override_score ?? t.computed_score ?? (t.facets ? scoreFromFacets(t.facets, t.depends_on.length, tasks.filter((x) => x.depends_on.includes(t.id)).length) : null);
      const b = score === null ? { band: "unscored", agent: null } : bandFor(score, cfg);
      const g = grouped.get(b.band) || { agent: b.agent, n: 0, tasks: [] };
      g.n++;
      g.tasks.push(t.id);
      grouped.set(b.band, g);
    }
  }

  for (const [band, g] of grouped) {
    const src = (rates && rates.bands && rates.bands[band]) || (g.agent && rates && rates.roles && rates.roles[g.agent]) || null;
    const samples = src ? src.samples : 0;
    if (!src || samples < minSamples) low++;
    const per50 = src ? src.p50 : null;
    const per90 = src ? src.p90 : null;
    rows.push({ band, agent: g.agent, count: g.n, tasks: g.tasks, samples, p50: per50 ? mulVec(per50, g.n) : null, p90: per90 ? mulVec(per90, g.n) : null });
    if (per50) {
      Object.assign(p50, sumVec(p50, mulVec(per50, g.n)));
      Object.assign(p90, sumVec(p90, mulVec(per90 || per50, g.n)));
    }
    // Context risk: the p90 PEAK prompt for this band against the model's
    // window. Forecast before the wave, not after compaction.
    if (src && src.peak_p90 && g.agent) {
      const win = contextWindowFor(g.agent);
      if (win && src.peak_p90 / win > 0.9)
        for (const id of g.tasks)
          contextRisk.push({ task: id, agent: g.agent, peak: src.peak_p90, window: win, pct: Math.round((src.peak_p90 / win) * 100) });
    }
  }

  const fixed = [];
  for (const role of LANE_FIXED_ROLES[lane] || []) {
    const src = rates && rates.roles && rates.roles[role];
    if (!src) {
      lowRoles++;
      fixed.push({ role, samples: 0, p50: null });
      continue;
    }
    fixed.push({ role, samples: src.samples, p50: src.p50, p90: src.p90 });
    Object.assign(p50, sumVec(p50, src.p50));
    Object.assign(p90, sumVec(p90, src.p90));
  }

  return { lane, cmd: LANE_CMD[lane], rows, fixed, p50, p90, low_confidence_bands: low, low_confidence_roles: lowRoles, context_risk: contextRisk };
}

const mulVec = (v, n) => {
  const out = {};
  for (const k of VEC_KINDS) out[k] = Math.round((v[k] || 0) * n);
  return out;
};

let readPricingCache = null;
function contextWindowFor(agent) {
  const m = modelOf(agent);
  const t = readPricingCache;
  return t && t.context_windows ? t.context_windows[m] || null : null;
}

function quotaView(table, cfg, weighted) {
  const plan = String(cfg.budget_plan || "auto");
  // NEVER a quota figure without a known plan. `auto` with nothing to detect from
  // says so in one line and offers the one-off question — a wrong guess rendered
  // as a percentage is worse than no percentage.
  if (plan === "auto" || plan === "api") return { available: false, plan, reason: plan === "api" ? "billed per token — the USD view is the primary one" : "budget_plan is not set (orc config set budget_plan pro|max5|max20|api)" };
  const p = table && table.plans && table.plans[plan];
  if (!p) return { available: false, plan, reason: "no capacity row for this plan in the price table" };
  return {
    available: true,
    plan,
    label: p.label,
    window_pct: (weighted / p.window_weighted_tokens) * 100,
    weekly_pct: (weighted / p.weekly_weighted_tokens) * 100,
  };
}

function budgetForecast(claudeDir, planPath) {
  const asJson = wantsJson();
  const cfg = resolvedConfig(claudeDir);
  const table = readPricing(claudeDir);
  readPricingCache = table;
  const naive = flag("--naive") === true;
  const asView = typeof flag("--as") === "string" ? String(flag("--as")) : String(cfg.budget_units || "auto");

  if (!planPath) {
    console.error("usage: orc budget forecast <plan-file> [--json] [--as tokens|usd|quota|context|all]");
    process.exit(1);
  }
  const root = repoRootOf(claudeDir);
  const abs = path.isAbsolute(planPath)
    ? planPath
    : [path.join(root, planPath), path.join(process.cwd(), planPath)].find((c) => fs.existsSync(c)) ||
      path.join(root, planPath);
  if (!fs.existsSync(abs)) {
    if (asJson) emitJson({ ok: false, reason: "no-plan", path: abs }, 3);
    console.log(`no such plan file: ${abs}`);
    process.exit(3);
  }
  const tasks = parsePlanTasks(fs.readFileSync(abs, "utf8"));
  if (!tasks.length) {
    if (asJson) emitJson({ ok: false, reason: "not-a-plan", path: abs, hint: "no `- id:` task blocks found — a forecast needs a PLAN, not a request" }, 3);
    console.log(`not a plan: no \`- id:\` task blocks in ${path.basename(abs)}.\n  A forecast from a sentence is a guess that looks computed. Run /orc-plan first.`);
    process.exit(3);
  }
  const rates = naive ? null : budgetRates(claudeDir);
  const haveHistory = !!(rates && rates.dispatches_joined);
  if (!haveHistory && !naive) {
    const msg =
      "BUDGET · no forecast\n" +
      `  0 joinable dispatches in ${resolveLogDir(claudeDir)} and ${transcriptDir(repoRootOf(claudeDir))}.\n` +
      "  I will not invent numbers. Run /orc or /orc-mini once, then ask again.\n" +
      "  A floor from the public price table only:  orc budget forecast --naive";
    if (asJson) emitJson({ ok: false, reason: "no-history", tasks: tasks.length, hint: msg }, 3);
    console.log(msg);
    process.exit(3);
  }

  const waves = Math.max(1, new Set(tasks.map((t) => t.depends_on.length)).size);
  const lanes = FORECAST_LANES.map((l) => laneForecast(l, tasks, rates, cfg));
  const primary = lanes.find((l) => l.lane === "orc");
  const money50 = priceVector(claudeDir, primary.p50, "claude-opus-4-8");
  const money90 = priceVector(claudeDir, primary.p90, "claude-opus-4-8");
  const quota = quotaView(table, cfg, money50.weighted);
  const risk = primary.context_risk;
  const code = risk.length ? 2 : primary.low_confidence_bands ? 1 : 0;

  if (asJson)
    emitJson(
      {
        ok: true,
        plan: abs,
        tasks: tasks.length,
        waves,
        // The vector is the object. usd and quota are DERIVED FROM it here and
        // are never stored beside it — a caller can always recompute them.
        tokens: { p50: primary.p50, p90: primary.p90 },
        raw: { p50: rawTokens(primary.p50), p90: rawTokens(primary.p90) },
        weighted: { p50: money50.weighted, p90: money90.weighted },
        usd: { p50: money50.usd, p90: money90.usd },
        price_table: table ? { as_of: table.as_of, age_days: table._age_days, stale: table._stale, path: table._path } : null,
        quota,
        context_risk: risk,
        bands: primary.rows,
        fixed_roles: primary.fixed,
        low_confidence_bands: primary.low_confidence_bands,
        min_samples: Number(cfg.budget_min_samples) || 5,
        unattributed: rates ? rates.unattributed : { blocks: 0, tokens: ZERO_VEC },
        transcripts_readable: rates ? rates.transcripts_readable : false,
        lanes: lanes.map((l) => ({
          lane: l.lane,
          cmd: l.cmd,
          raw: rawTokens(l.p50),
          weighted: weightedTokens(l.p50),
          usd: priceVector(claudeDir, l.p50, "claude-opus-4-8").usd,
          low_confidence_bands: l.low_confidence_bands,
          low_confidence_roles: l.low_confidence_roles,
        })),
        view: asView,
      },
      code
    );

  console.log(ui.header(`ORC · budget · forecast — ${plural(tasks.length, "task")}, on /orc`));
  const show = (v) => asView === "all" || asView === "auto" || asView === v;
  if (show("tokens")) {
    const vecCols = (v) =>
      v
        ? `${kTok(v.input).padStart(7)} ${kTok(v.cache_write).padStart(9)} ${kTok(v.cache_read).padStart(9)} ${kTok(v.output).padStart(9)}`
        : "  insufficient history".padEnd(37);
    console.log("\nTOKENS  (p50 → p90)");
    console.log("  band             model                              in   cache-w   cache-r       out");
    console.log("  " + "─".repeat(74));
    for (const r of primary.rows)
      console.log(
        `  ${r.band.padEnd(15)}×${String(r.count).padEnd(2)} ${String(r.agent || "unscored").replace(/^orc-executor-/, "").padEnd(26)} ${vecCols(r.p50)}`
      );
    for (const f of primary.fixed)
      console.log(`  ${"fixed role".padEnd(18)} ${f.role.replace(/^orc-/, "").padEnd(26)} ${vecCols(f.p50)}`);
    console.log("  " + "─".repeat(74));
    console.log(`  ${"TOTAL p50".padEnd(18)} ${"".padEnd(26)} ${vecCols(primary.p50)}`);
    console.log(`  ${"TOTAL p90".padEnd(18)} ${"".padEnd(26)} ${vecCols(primary.p90)}`);
    console.log(`\n  weighted total (cache-read at ${CACHE_READ_WEIGHT}×)      p50  ${kTok(money50.weighted)}-equivalent`);
    console.log(`  raw total                                p50  ${kTok(money50.raw)} tokens`);
  }
  if (show("usd")) {
    const stale = table && table._stale ? `  ⚠ price table ${table._age_days === null ? "undated" : table._age_days + " days old"} (> ${PRICE_STALE_DAYS})` : table ? `  price table ${table.as_of} (${table._age_days} days old ✓)` : "";
    console.log(
      `\nUSD          ` +
        (money50.usd === null ? "unavailable: no rate for this model in the price table" : `$${money50.usd.toFixed(2)} → $${money90.usd.toFixed(2)}${stale}`)
    );
  }
  if (show("quota"))
    console.log(
      `QUOTA        ` +
        (quota.available
          ? `${quota.window_pct.toFixed(1)}% of a 5-hour window on ${quota.label}\n             ${quota.weekly_pct.toFixed(1)}% of the weekly limit`
          : quota.reason)
    );
  if (show("context") || risk.length)
    console.log(
      `\nCONTEXT      ` +
        (risk.length
          ? `${plural(risk.length, "task")} at risk — ` + risk.map((r) => `${r.task} est. ${kTok(r.peak)}/${kTok(r.window)} (${r.pct}%)`).join(", ")
          : "no task forecasts above 90% of its window")
    );
  // A forecast is a range WITH a sample count, never one number — so the
  // shortfall is stated per band AND per fixed role, not folded into one figure.
  console.log(
    `\nCONFIDENCE   ${primary.rows.length - primary.low_confidence_bands} of ${plural(primary.rows.length, "band")} at or above budget_min_samples (${Number(cfg.budget_min_samples) || 5})` +
      (primary.low_confidence_roles
        ? `\n             ${plural(primary.low_confidence_roles, "fixed role")} ${primary.low_confidence_roles === 1 ? "has" : "have"} no history yet — the total is a FLOOR, not a range`
        : "")
  );
  if (rates && rates.unattributed)
    console.log(
      `             ${kTok(rawTokens(rates.unattributed.tokens))} in ${plural(rates.unattributed.blocks, "block")} are unattributed in the corpus.`
    );
  if (rates && !rates.transcripts_readable)
    console.log("             dollars and quota unavailable: no local usage data (tokens are from ORC trace metadata)");

  console.log("\n  lane          raw p50    weighted    usd p50");
  console.log("  " + "─".repeat(46));
  for (const l of lanes) {
    const u = priceVector(claudeDir, l.p50, "claude-opus-4-8").usd;
    console.log(
      `  ${(l.cmd || l.lane).padEnd(13)} ${(rawTokens(l.p50) ? kTok(rawTokens(l.p50)) : "—").padStart(8)} ${(rawTokens(l.p50) ? kTok(weightedTokens(l.p50)) : "—").padStart(11)} ${(u === null || !rawTokens(l.p50) ? "—" : "$" + u.toFixed(2)).padStart(10)}` +
        (l.low_confidence_bands + l.low_confidence_roles ? "  floor" : "") +
        (l.lane === "orc" ? "  ←" : "")
    );
  }
  process.exit(code);
}

function budgetActual(claudeDir, slugArg) {
  const asJson = wantsJson();
  readPricingCache = readPricing(claudeDir);
  const { runs } = listTraces(claudeDir);
  const run = runs.find((r) => r.name === slugArg || r.slug === slugArg || (r.slug && slugArg && r.slug.includes(slugArg)));
  if (!run) {
    if (asJson) emitJson({ ok: false, reason: "no-run", asked: slugArg || null, known: runs.slice(0, 10).map((r) => r.slug) }, 3);
    console.log(`no trace matching "${slugArg || ""}". Known runs:\n` + runs.slice(0, 10).map((r) => "  " + r.slug).join("\n"));
    process.exit(3);
  }
  const trace = readTraceMeta(run.path);
  const corpus = readCorpus(repoRootOf(claudeDir));
  const j = joinRun(trace, corpus.groups);
  const rates = budgetRates(claudeDir);
  const byBand = {};
  let actual = { ...ZERO_VEC };
  for (const row of j.rows) {
    if (!row.group) continue;
    const band = (trace.bands[row.task.split(/\s+/)[0]] || {}).band || row.agent;
    const b = (byBand[band] = byBand[band] || { n: 0, vec: { ...ZERO_VEC } });
    b.n++;
    b.vec = sumVec(b.vec, row.group.vec);
    actual = sumVec(actual, row.group.vec);
  }
  const rows = Object.entries(byBand).map(([band, v]) => {
    const src = (rates && rates.bands && rates.bands[band]) || (rates && rates.roles && rates.roles[band]) || null;
    const fc = src ? mulVec(src.p50, v.n) : null;
    return {
      band,
      dispatches: v.n,
      forecast_weighted: fc ? weightedTokens(fc) : null,
      actual_weighted: weightedTokens(v.vec),
      diff_pct: fc && weightedTokens(fc) ? Math.round(((weightedTokens(v.vec) - weightedTokens(fc)) / weightedTokens(fc)) * 100) : null,
      tokens: v.vec,
    };
  });
  const unatt = j.unattributed.reduce((a, g) => sumVec(a, g.vec), { ...ZERO_VEC });
  const money = priceVector(claudeDir, actual, "claude-opus-4-8");
  const cacheShare = rawTokens(actual) ? actual.cache_read / rawTokens(actual) : 0;

  if (asJson)
    emitJson(
      {
        ok: true,
        run: run.slug,
        lane: run.lane,
        trace: run.name,
        rows,
        actual: { tokens: actual, raw: rawTokens(actual), weighted: money.weighted, usd: money.usd },
        cache_read_share: cacheShare,
        unattributed: { blocks: j.unattributed.length, tokens: unatt },
        joined: j.rows.filter((r) => r.group).length,
        dispatches: j.rows.length,
      },
      0
    );

  console.log(ui.header(`ORC · budget · actual — ${run.slug} (/${run.lane})`));
  console.log("\n  band                 disp   forecast p50 (w)     actual (w)     diff");
  console.log("  " + "─".repeat(66));
  for (const r of rows)
    console.log(
      `  ${r.band.replace(/^orc-/, "").padEnd(26)} ${String(r.dispatches).padStart(4)}   ${(r.forecast_weighted === null ? "—" : kTok(r.forecast_weighted)).padStart(16)}   ${kTok(r.actual_weighted).padStart(12)}   ${(r.diff_pct === null ? "—" : (r.diff_pct > 0 ? "+" : "") + r.diff_pct + "%").padStart(6)}`
    );
  console.log("  " + "─".repeat(66));
  console.log(
    `  TOTAL actual    ${kTok(money.weighted)} weighted / ${kTok(money.raw)} raw` +
      (money.usd === null ? "" : ` / $${money.usd.toFixed(2)}`)
  );
  console.log(`  cache-read share  ${(cacheShare * 100).toFixed(0)}% of raw tokens`);
  console.log(
    `  unattributed      ${j.unattributed.length ? `${kTok(rawTokens(unatt))} in ${plural(j.unattributed.length, "block")} could not be joined to a task` : "0"}`
  );
  console.log(`\n  Feed to /orc-retro for calibration.`);
}

function budgetRatesCmd(claudeDir) {
  const asJson = wantsJson();
  const rates = budgetRates(claudeDir);
  if (!rates) {
    if (asJson) emitJson({ ok: false, reason: "no-rates" }, 3);
    console.log("no rate model yet — run `orc budget calibrate` (free; reads traces + local transcripts).");
    process.exit(3);
  }
  if (asJson) emitJson({ ok: true, ...rates }, rates.dispatches_joined ? 0 : 3);
  console.log(ui.header("ORC · budget · rates (tokens per dispatch)"));
  console.log(
    ui.kv([
      ["calibrated", rates.calibrated_at],
      ["dispatches joined", String(rates.dispatches_joined)],
      ["transcripts", rates.transcripts_readable ? `${rates.transcript_files} file(s) — ${rates.transcript_dir}` : `unreadable — ${rates.transcript_dir}`],
      ["unattributed", `${rates.unattributed.blocks} block(s), ${kTok(rawTokens(rates.unattributed.tokens))}`],
    ])
  );
  const rowsOf = (bag, title) => {
    const keys = Object.keys(bag || {});
    if (!keys.length) return;
    console.log("\n" + ui.color.bold(title));
    for (const k of keys) {
      const v = bag[k];
      console.log(
        `  ${k.replace(/^orc-/, "").padEnd(30)} n=${String(v.samples).padStart(3)}  p50 ${kTok(rawTokens(v.p50)).padStart(7)}  p90 ${kTok(rawTokens(v.p90)).padStart(7)}  peak p90 ${kTok(v.peak_p90)}`
      );
    }
  };
  rowsOf(rates.bands, "Bands (executors)");
  rowsOf(rates.roles, "Roles");
  if (!rates.dispatches_joined) process.exit(3);
}

function budget() {
  if (flag("--global")) {
    console.error("❌ orc budget is project-scoped — the traces and the plan live in the repo. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["budget", <sub?>, <arg?>]
  switch (pos[1]) {
    case "forecast":
      budgetForecast(claudeDir, pos[2]);
      break;
    case "actual":
      budgetActual(claudeDir, pos[2]);
      break;
    case undefined:
    case "rates":
      budgetRatesCmd(claudeDir);
      break;
    case "calibrate": {
      const out = calibrate(claudeDir);
      if (wantsJson()) emitJson({ ok: true, ...out }, out.dispatches_joined ? 0 : 3);
      console.log(
        `✓ calibrated — ${out.dispatches_joined} dispatch(es) joined from ${out.traces_read} trace(s)` +
          ` and ${out.transcript_files} transcript file(s)\n  ${ratesPath(claudeDir)}` +
          (out.unattributed.blocks ? `\n  ${out.unattributed.blocks} sidechain block(s) could not be joined to a task (always reported, never dropped)` : "")
      );
      if (!out.dispatches_joined) process.exit(3);
      break;
    }
    default:
      console.error(
        `Unknown: orc budget ${pos[1]}\n` +
          "Usage: orc budget forecast <plan> [--as tokens|usd|quota|context|all] [--naive]\n" +
          "       orc budget actual <run-slug>     what the run really cost, vs the rate model\n" +
          "       orc budget rates                 what the corpus says per band, in tokens\n" +
          "       orc budget calibrate             rebuild the model from traces + transcripts"
      );
      process.exit(1);
  }
}

// ── /orc-pact (v0.46.0) — the invariant ledger ───────────────────────────────
//
// /orc-grill and /orc-brainstorm already tag every settled decision `intent` or
// `constraint`, and constraints become `spec_invariants[]`. Then the run ended
// and they evaporated. This is the ledger that outlives the run.
//
// FOUR STATES, COMPUTED — NEVER STORED, exactly like a wiki doc's freshness:
//   HOLDING      its check passed at a commit that still covers its anchors
//   DRIFTED      commits since verified_commit touched files it anchors
//                (COVERAGE-RELATIVE — not a global date, not a repo-wide diff)
//   UNCHECKABLE  no cheap check exists. THE HONEST STATE, and the point of the
//                lane: a promise nobody can test is worth knowing about.
//   BROKEN       the check ran and failed
//
// ASSUMPTIONS ARE NOT A SECOND LEDGER. An assumption is an invariant with
// `confidence: low` and `check.kind: manual`. Two ledgers would be drift.

const PACT_DIR = "pact";
const PACT_LEDGER = "ledger.json";
const PACT_DOC = "PACT.md";
const PACT_CHECK_KINDS = ["test", "command", "grep", "manual"];

function pactPaths(claudeDir) {
  const root = repoRootOf(claudeDir);
  return {
    root,
    dir: path.join(claudeDir, "orc", PACT_DIR),
    ledger: path.join(claudeDir, "orc", PACT_DIR, PACT_LEDGER),
    doc: path.join(root, PACT_DOC),
  };
}

function readLedger(claudeDir) {
  const p = pactPaths(claudeDir);
  if (!fs.existsSync(p.ledger)) return null;
  try {
    const l = JSON.parse(fs.readFileSync(p.ledger, "utf8"));
    l.entries = Array.isArray(l.entries) ? l.entries : [];
    return l;
  } catch (_) {
    return null;
  }
}

function writeLedger(claudeDir, ledger) {
  const p = pactPaths(claudeDir);
  fs.mkdirSync(p.dir, { recursive: true });
  ledger.version = 1;
  ledger.updated_at = fmtStamp(new Date());
  fs.writeFileSync(p.ledger, JSON.stringify(ledger, null, 2) + "\n");
  return p.ledger;
}

// The state machine. Everything here is derived from the entry + git; nothing
// reads a stored status field, because a stored status is a status that lies the
// moment somebody commits.
function pactStateOf(root, e) {
  const kind = (e.check && e.check.kind) || "manual";
  const lc = e.last_check || null;
  if (lc && lc.status === "fail") return { state: "BROKEN", why: `check failed at ${String(lc.commit || "").slice(0, 8)}${lc.at ? " (" + lc.at + ")" : ""}` };
  if (kind === "manual" || !e.check || !e.check.ref)
    return { state: "UNCHECKABLE", why: "no cheap check exists — this promise is held by review, not by a runner" };
  const anchorFiles = (e.anchors || []).map((a) => String(a).split(":")[0]).filter(Boolean);
  if (!e.verified_commit) return { state: "DRIFTED", why: "never verified at a commit" };
  const argv = ["rev-list", "--count", `${e.verified_commit}..HEAD`];
  if (anchorFiles.length) argv.push("--", ...anchorFiles.slice(0, 100));
  const n = gitIn(root, argv);
  if (n === null || !/^\d+$/.test(n)) return { state: "UNCHECKABLE", why: `verified_commit ${String(e.verified_commit).slice(0, 8)} is not resolvable here` };
  const d = Number(n);
  if (d > 0)
    return {
      state: "DRIFTED",
      why: `${plural(d, "commit")} since ${String(e.verified_commit).slice(0, 8)} touched ${plural(anchorFiles.length, "anchored file")}`,
      distance: d,
    };
  return { state: "HOLDING", why: `verified at ${String(e.verified_commit).slice(0, 8)}; no commit since has touched its anchors`, distance: 0 };
}

const PACT_ORDER = { BROKEN: 0, DRIFTED: 1, UNCHECKABLE: 2, HOLDING: 3 };

function pactRows(claudeDir) {
  const p = pactPaths(claudeDir);
  const ledger = readLedger(claudeDir);
  if (!ledger) return { error: "no-ledger", paths: p };
  const rows = ledger.entries.map((e) => {
    const st = pactStateOf(p.root, e);
    return {
      id: e.id,
      statement: e.statement || "",
      origin: e.origin || null,
      anchors: e.anchors || [],
      check: e.check || { kind: "manual", ref: null },
      verified_commit: e.verified_commit || null,
      confidence: e.confidence || "medium",
      last_check: e.last_check || null,
      history: Array.isArray(e.history) ? e.history : [],
      retired: !!e.retired,
      state: st.state,
      why: st.why,
      distance: st.distance === undefined ? null : st.distance,
    };
  });
  const live = rows.filter((r) => !r.retired);
  live.sort((a, b) => PACT_ORDER[a.state] - PACT_ORDER[b.state] || a.id.localeCompare(b.id));
  return { ledger, rows: live, retired: rows.filter((r) => r.retired), paths: p };
}

const pactCode = (rows) =>
  rows.some((r) => r.state === "BROKEN") ? 2 : rows.some((r) => r.state === "DRIFTED") ? 1 : 0;

function pactStatus(claudeDir) {
  const asJson = wantsJson();
  const p = pactRows(claudeDir);
  if (p.error) {
    const hint = "no pact ledger yet — run `/orc-pact` to harvest one (its input is a run's spec_invariants[], never an invented promise).";
    if (asJson) emitJson({ ok: false, reason: "no-ledger", ledger: p.paths.ledger, entries: 0, counts: {}, rows: [], hint }, 3);
    console.log(hint);
    process.exit(3);
  }
  const counts = { HOLDING: 0, DRIFTED: 0, UNCHECKABLE: 0, BROKEN: 0 };
  for (const r of p.rows) counts[r.state]++;
  const code = pactCode(p.rows);
  if (asJson)
    emitJson(
      {
        ok: true,
        ledger: p.paths.ledger,
        doc: p.paths.doc,
        doc_exists: fs.existsSync(p.paths.doc),
        entries: p.rows.length,
        retired: p.retired.length,
        counts,
        // The one preflight line /orc prints. Assembled here so the spine never
        // composes a second wording for it.
        line: `pact: ${counts.HOLDING} holding · ${counts.DRIFTED} drifted · ${counts.UNCHECKABLE} uncheckable${counts.BROKEN ? " · " + counts.BROKEN + " BROKEN" : ""}`,
        rows: p.rows,
      },
      code
    );
  if (!p.rows.length) {
    console.log("pact ledger exists but has no live entries. `/orc-pact` harvests from a run's spec_invariants[].");
    process.exit(0);
  }
  console.log(ui.header(`ORC · pact — ${plural(p.rows.length, "promise")}`));
  console.log(
    `\n  ${counts.HOLDING} holding · ${counts.DRIFTED} drifted · ${counts.UNCHECKABLE} uncheckable` +
      (counts.BROKEN ? ` · ${counts.BROKEN} BROKEN` : "") +
      (p.retired.length ? `  (${p.retired.length} retired)` : "") +
      "\n"
  );
  for (const r of p.rows) {
    console.log(`  ${r.state.padEnd(12)} ${r.id}  ${r.statement}`);
    console.log(`  ${"".padEnd(12)} ${ui.color.gray(r.why)}`);
    if (r.anchors.length) console.log(`  ${"".padEnd(12)} anchors: ${r.anchors.slice(0, 3).join(", ")}`);
    if (r.check && r.check.ref) console.log(`  ${"".padEnd(12)} check (${r.check.kind}): ${r.check.ref}`);
  }
  console.log(
    "\n  UNCHECKABLE is the honest state, not a failure — it never raises the exit code.\n" +
      "  Re-check the drifted ones:  orc pact check"
  );
  process.exit(code);
}

// Run an entry's own cheapest proof. `test`/`command` shell the ref; `grep`
// searches the anchors for it. A PASS re-anchors to HEAD — that is what clears
// DRIFTED without a model ever being involved.
function runPactCheck(root, e) {
  const kind = (e.check && e.check.kind) || "manual";
  const ref = e.check && e.check.ref;
  if (kind === "manual" || !ref) return { status: "skipped", reason: "manual check — a human decides this one" };
  if (kind === "grep") {
    const files = (e.anchors || []).map((a) => String(a).split(":")[0]).filter(Boolean);
    if (!files.length) return { status: "skipped", reason: "grep check with no anchors to search" };
    let hit = false;
    for (const f of files) {
      try {
        if (fs.readFileSync(path.join(root, f), "utf8").includes(ref)) {
          hit = true;
          break;
        }
      } catch (_) {}
    }
    return { status: hit ? "pass" : "fail", output: hit ? `found "${ref}"` : `"${ref}" not found in ${files.length} anchored file(s)` };
  }
  const r = spawnSync(ref, { cwd: root, shell: true, encoding: "utf8", timeout: 10 * 60_000 });
  const out = ((r.stdout || "") + (r.stderr || "")).trim();
  return { status: r.status === 0 ? "pass" : "fail", exit_code: r.status, output: out.slice(-2000) };
}

function pactCheckCmd(claudeDir, idArg) {
  const asJson = wantsJson();
  const p = pactRows(claudeDir);
  if (p.error) {
    if (asJson) emitJson({ ok: false, reason: "no-ledger" }, 3);
    console.log("no pact ledger — nothing to check.");
    process.exit(3);
  }
  const head = gitIn(p.paths.root, ["rev-parse", "HEAD"]);
  const target = idArg
    ? p.rows.filter((r) => r.id === idArg)
    : p.rows.filter((r) => r.state === "DRIFTED" || r.state === "BROKEN");
  if (idArg && !target.length) {
    if (asJson) emitJson({ ok: false, reason: "no-such-id", asked: idArg }, 1);
    console.log(`no live entry ${idArg}.`);
    process.exit(1);
  }
  const results = [];
  for (const r of target) {
    const entry = p.ledger.entries.find((x) => x.id === r.id);
    const res = runPactCheck(p.paths.root, entry);
    results.push({ id: r.id, statement: r.statement, ...res });
    if (res.status === "skipped") continue;
    entry.last_check = { status: res.status, commit: head, at: fmtStamp(new Date()), ref: entry.check.ref };
    entry.history = Array.isArray(entry.history) ? entry.history : [];
    entry.history.unshift({ at: entry.last_check.at, status: res.status, commit: head });
    entry.history = entry.history.slice(0, 10);
    // A PASS re-anchors. NEVER auto-retire and never auto-edit the statement:
    // retirement is a user decision with a recorded reason.
    if (res.status === "pass") entry.verified_commit = head;
  }
  writeLedger(claudeDir, p.ledger);
  const after = pactRows(claudeDir);
  const code = pactCode(after.rows);
  if (asJson) emitJson({ ok: true, checked: results.length, results, counts_after: after.rows.reduce((a, r) => ((a[r.state] = (a[r.state] || 0) + 1), a), {}) }, code);
  if (!results.length) {
    console.log("nothing to re-check — no DRIFTED or BROKEN entry.");
    process.exit(0);
  }
  for (const r of results)
    console.log(
      `  ${r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "–"} ${r.id}  ${r.status.toUpperCase()}  ${r.statement}` +
        (r.status === "fail" && r.output ? "\n      " + String(r.output).split("\n").slice(-3).join("\n      ") : "") +
        (r.status === "skipped" ? "\n      " + r.reason : "")
    );
  console.log(`\n  ledger updated. A pass re-anchored to ${String(head || "").slice(0, 8)}.`);
  process.exit(code);
}

// PACT.md is DERIVED — 100% from the ledger, written only by this command, the
// same rule wiki-meta.json + INDEX.md live under. It is a COMMITTED deliverable
// at the project root, never hidden in .claude/: a PM has to be able to read it
// in a PR.
function pactSync(claudeDir) {
  const p = pactRows(claudeDir);
  if (p.error) {
    console.log("no pact ledger — nothing to render.");
    process.exit(3);
  }
  const counts = { HOLDING: 0, DRIFTED: 0, UNCHECKABLE: 0, BROKEN: 0 };
  for (const r of p.rows) counts[r.state]++;
  const lines = [
    "<!-- orc-pact:derived — written by `orc pact sync`. Do NOT hand-edit:",
    "     the source of truth is .claude/orc/pact/ledger.json. -->",
    "",
    "# Promises this project makes",
    "",
    `${counts.HOLDING} holding · ${counts.DRIFTED} drifted · ${counts.UNCHECKABLE} uncheckable` +
      (counts.BROKEN ? ` · **${counts.BROKEN} broken**` : "") +
      `  ·  rendered ${fmtStamp(new Date())}`,
    "",
    "State is COMPUTED on read, never stored: **DRIFTED** means commits since the",
    "promise was last verified touched the files it anchors. **UNCHECKABLE** means",
    "no cheap check exists — that is honest, not a failure.",
    "",
  ];
  for (const state of ["BROKEN", "DRIFTED", "UNCHECKABLE", "HOLDING"]) {
    const rows = p.rows.filter((r) => r.state === state);
    if (!rows.length) continue;
    lines.push(`## ${state}`, "");
    for (const r of rows) {
      lines.push(`### ${r.id} — ${r.statement}`, "");
      lines.push(`- state: ${r.state} — ${r.why}`);
      if (r.anchors.length) lines.push(`- anchors: ${r.anchors.map((a) => "`" + a + "`").join(", ")}`);
      lines.push(`- check: ${r.check.kind}${r.check.ref ? " — `" + r.check.ref + "`" : ""}`);
      if (r.origin) lines.push(`- origin: ${r.origin.lane || "?"}${r.origin.run ? " (" + r.origin.run + ")" : ""} · ${r.origin.kind || "constraint"}`);
      lines.push(`- confidence: ${r.confidence}`);
      lines.push("");
    }
  }
  if (p.retired.length) {
    lines.push("## Retired", "");
    for (const r of p.retired) lines.push(`- ~~${r.id}~~ ${r.statement}${r.retired_reason ? " — " + r.retired_reason : ""}`);
    lines.push("");
  }
  fs.writeFileSync(p.paths.doc, lines.join("\n"));
  console.log(`✓ ${PACT_DOC} rendered from the ledger — ${plural(p.rows.length, "promise")}, ${p.retired.length} retired.\n  ${p.paths.doc}`);
}

function pact() {
  if (flag("--global")) {
    console.error("❌ orc pact is project-scoped — the promises are this repo's. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["pact", <sub?>, <id?>]
  switch (pos[1]) {
    case undefined:
    case "status":
      pactStatus(claudeDir);
      break;
    case "check":
      pactCheckCmd(claudeDir, pos[2]);
      break;
    case "sync":
      pactSync(claudeDir);
      break;
    default:
      console.error(
        `Unknown: orc pact ${pos[1]}\n` +
          "Usage: orc pact status [--json]   computed states (exit 0 holding / 1 drifted / 2 broken / 3 no ledger)\n" +
          "       orc pact check [<id>]      run the cheap checks and re-anchor what passes\n" +
          "       orc pact sync              re-render the derived PACT.md from the ledger"
      );
      process.exit(1);
  }
}

// ── /orc-boundary (v0.46.0) — execute · escalate · refuse ────────────────────
//
// Every skill in the ecosystem assumes the answer to "should the agent do this?"
// is yes. Measured cost: agents spend 5x-50x longer than human experts, mostly on
// attempts that were never going to succeed.
//
// A REFUSE ALWAYS NAMES WHAT WOULD MAKE IT A YES. "No" with no "unless" is not a
// boundary, it is a shrug — so a REFUSE card with no checklist is MALFORMED and
// reported as an error, never rendered as an empty card.
//
// The artifact is a card per AREA, not per request, so it is computed once and
// consulted in O(1). Cards go stale the same coverage-relative way a wiki doc
// does: commits since `verified_commit` that touched `anchored_files`.

const BOUNDARY_DIR = "boundary";
const BOUNDARY_VERDICTS = ["EXECUTE", "ESCALATE", "REFUSE"];

function boundaryPaths(claudeDir) {
  return { root: repoRootOf(claudeDir), dir: path.join(claudeDir, "orc", BOUNDARY_DIR) };
}

function readBoundaryCards(claudeDir) {
  const p = boundaryPaths(claudeDir);
  const cards = [];
  let names = [];
  try {
    names = fs.readdirSync(p.dir).filter((f) => f.endsWith(".md"));
  } catch (_) {
    return { cards, dir: p.dir, root: p.root };
  }
  for (const n of names) {
    const abs = path.join(p.dir, n);
    const text = fs.readFileSync(abs, "utf8");
    const h = parseDocHeader(text) || {};
    const verdict = String(h.verdict || "").toUpperCase();
    const anchored = Array.isArray(h.anchored_files) ? h.anchored_files : [];
    const checklist = Array.isArray(h.checklist) ? h.checklist : [];
    // Staleness: coverage-relative, one shared idea with the wiki and the pact.
    let distance = null;
    if (h.verified_commit) {
      const argv = ["rev-list", "--count", `${h.verified_commit}..HEAD`];
      if (anchored.length) argv.push("--", ...anchored.slice(0, 100));
      const out = gitIn(p.root, argv);
      if (out !== null && /^\d+$/.test(out)) distance = Number(out);
    }
    const malformed = [];
    if (!BOUNDARY_VERDICTS.includes(verdict)) malformed.push(`verdict must be one of ${BOUNDARY_VERDICTS.join(" | ")}`);
    if (verdict === "REFUSE" && !checklist.length)
      malformed.push("a REFUSE with no checklist is malformed — a boundary must name what would make it a yes");
    if (verdict === "ESCALATE" && !h.escalate_to) malformed.push("an ESCALATE must name the human it escalates to");
    cards.push({
      file: n,
      path: abs,
      area: h.area || n.replace(/\.md$/, ""),
      verdict: BOUNDARY_VERDICTS.includes(verdict) ? verdict : null,
      checklist,
      escalate_to: h.escalate_to || null,
      anchored_files: anchored,
      verified_commit: h.verified_commit || null,
      distance,
      stale: distance !== null && distance > 0,
      malformed,
      reasons: Array.isArray(h.reasons) ? h.reasons : [],
    });
  }
  cards.sort((a, b) => a.area.localeCompare(b.area));
  return { cards, dir: p.dir, root: p.root };
}

function boundaryStatus(claudeDir, pathArg) {
  const asJson = wantsJson();
  const { cards, dir } = readBoundaryCards(claudeDir);
  const filtered = pathArg
    ? cards.filter((c) => c.area === pathArg || String(pathArg).startsWith(c.area + "/") || c.area.startsWith(String(pathArg)))
    : cards;
  if (!filtered.length) {
    const hint = pathArg
      ? `no boundary card covers ${pathArg} — run \`/orc-boundary\` scoped to it. An area with no card is UNKNOWN, never assumed safe.`
      : `no boundary cards yet — run \`/orc-boundary\` to write them (${dir}).`;
    if (asJson) emitJson({ ok: false, reason: "no-card", asked: pathArg || null, dir, cards: [], counts: {}, hint }, 3);
    console.log(hint);
    process.exit(3);
  }
  const counts = { EXECUTE: 0, ESCALATE: 0, REFUSE: 0 };
  for (const c of filtered) if (c.verdict) counts[c.verdict]++;
  const stale = filtered.filter((c) => c.stale).length;
  const malformed = filtered.filter((c) => c.malformed.length);
  const code = malformed.length || stale === filtered.length ? 3 : counts.REFUSE ? 2 : counts.ESCALATE ? 1 : 0;

  if (asJson)
    emitJson(
      {
        ok: !malformed.length,
        dir,
        cards: filtered,
        counts,
        stale,
        malformed: malformed.map((c) => ({ area: c.area, problems: c.malformed })),
        line: `boundary: ${counts.EXECUTE} execute · ${counts.ESCALATE} escalate · ${counts.REFUSE} refuse${stale ? ` (${stale} stale)` : ""}`,
      },
      code
    );

  console.log(ui.header(`ORC · boundary — ${plural(filtered.length, "area")}`));
  console.log(`\n  ${counts.EXECUTE} execute · ${counts.ESCALATE} escalate · ${counts.REFUSE} refuse${stale ? ` (${stale} stale)` : ""}\n`);
  for (const c of filtered) {
    console.log(`  ${(c.verdict || "MALFORMED").padEnd(10)} ${c.area}${c.stale ? `   (stale — ${plural(c.distance, "commit")} since it was verified)` : ""}`);
    for (const r of c.reasons.slice(0, 3)) console.log(`  ${"".padEnd(10)} ${ui.color.gray(r)}`);
    if (c.verdict === "REFUSE")
      for (const k of c.checklist) console.log(`  ${"".padEnd(10)} □ ${k}`);
    if (c.verdict === "ESCALATE") console.log(`  ${"".padEnd(10)} → ${c.escalate_to}`);
    for (const m of c.malformed) console.log(`  ${"".padEnd(10)} ❌ ${m}`);
  }
  console.log(
    "\n  This gates ORC's OWN dispatch, never you: an explicit instruction always wins.\n" +
      `  Gate mode: boundary_gate=${resolvedConfig(claudeDir).boundary_gate}`
  );
  process.exit(code);
}

function boundary() {
  if (flag("--global")) {
    console.error("❌ orc boundary is project-scoped — the cards describe this repo. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["boundary", <sub?>, <path?>]
  switch (pos[1]) {
    case undefined:
    case "status":
      boundaryStatus(claudeDir, pos[2]);
      break;
    default:
      console.error(
        `Unknown: orc boundary ${pos[1]}\n` +
          "Usage: orc boundary status [<path>] [--json]   per-area verdicts\n" +
          "       exit 0 all EXECUTE / 1 any ESCALATE / 2 any REFUSE / 3 no card or stale"
      );
      process.exit(1);
  }
}

// ── /orc-handoff (v0.46.0) — what a non-developer can safely change ──────────
//
// THE INSIGHT NOBODY SHIPPED: the safety grade is NOT derived from file type. It
// is derived from WHETHER A CHEAP CHECK EXISTS for that surface. A YAML with a
// schema validator is GREEN; the same YAML without one is AMBER. That reframing
// is what makes this deterministic rather than a vibe.
//
//   GREEN  change it — a check will catch a mistake
//   AMBER  change it, but the check is manual — here it is
//   RED    looks like content, is not. ORC will not touch it.
//
// The map is written by the LANE (it needs to read the repo); this CLI READS it
// and owns the WRITE path, so the browser panel and the lane share one writer.

// The map's location is a registered contract token, so the CLI holds the WHOLE
// relative path as one literal — a rename on either side then fails the lint,
// which two assembled halves would not.
const HANDOFF_MAP_REL = "orc-handoff/surfaces.md";
const HANDOFF_DIR = HANDOFF_MAP_REL.split("/")[0];
const HANDOFF_MAP = HANDOFF_MAP_REL.split("/")[1];
const HANDOFF_GRADES = ["green", "amber", "red"];
// `## H-001 · <file> · <what it is>` — the heading is the identity, exactly like
// a gotcha entry. Fields are `- key: value` lines until the next heading.
const SURFACE_HEAD = /^##\s+(H-\d{3})\s+·\s+(.+?)\s+·\s+(.+?)\s*$/;

function handoffPaths(claudeDir) {
  const root = repoRootOf(claudeDir);
  return { root, dir: path.join(root, HANDOFF_DIR), map: path.join(root, HANDOFF_DIR, HANDOFF_MAP) };
}

function parseSurfaces(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let cur = null;
  for (const line of lines) {
    const m = SURFACE_HEAD.exec(line);
    if (m) {
      cur = { id: m[1], file: m[2].trim(), what: m[3].trim(), fields: {} };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    const f = /^-\s+([a-z_]+):\s*(.*)$/.exec(line);
    if (f) cur.fields[f[1]] = f[2].trim();
  }
  for (const s of out) {
    s.grade = HANDOFF_GRADES.includes(String(s.fields.grade).toLowerCase()) ? String(s.fields.grade).toLowerCase() : "red";
    s.check = s.fields.check || null;
    s.check_kind = s.fields.check_kind || (s.check ? "command" : "manual");
    s.revert = s.fields.revert || `git checkout -- ${s.file}`;
    s.reason = s.fields.reason || null;
    s.ask = s.fields.ask || null;
    s.exists = fs.existsSync(s.file) || undefined;
  }
  return out;
}

function handoffSurfaces(claudeDir) {
  const asJson = wantsJson();
  const p = handoffPaths(claudeDir);
  const surfaces = parseSurfaces(p.map).map((s) => ({
    ...s,
    exists: fs.existsSync(path.join(p.root, s.file)),
  }));
  const counts = { green: 0, amber: 0, red: 0 };
  for (const s of surfaces) counts[s.grade]++;
  const writable = isTrue(resolvedConfig(claudeDir).handoff_write);
  if (asJson)
    emitJson(
      {
        ok: true,
        map: p.map,
        map_exists: fs.existsSync(p.map),
        write_enabled: writable,
        counts,
        surfaces,
      },
      surfaces.length ? 0 : 1
    );
  if (!surfaces.length) {
    console.log(`no surface map yet — run \`/orc-handoff\` to make one (${p.map}).`);
    process.exit(1);
  }
  console.log(ui.header(`ORC · handoff — ${plural(surfaces.length, "surface")}`));
  console.log(`\n  ${counts.green} green · ${counts.amber} amber · ${counts.red} red   (writes ${writable ? "enabled" : "OFF — handoff_write=false"})\n`);
  for (const s of surfaces) {
    const dot = s.grade === "green" ? "🟢" : s.grade === "amber" ? "🟡" : "🔴";
    console.log(`  ${dot} ${s.id}  ${s.file}${s.exists ? "" : "   (missing)"}`);
    console.log(`      ${s.what}`);
    if (s.grade !== "red") {
      console.log(`      check:  ${s.check || "(manual — see the map)"}`);
      console.log(`      undo:   ${s.revert}`);
    } else {
      console.log(`      why not: ${s.reason || "looks like content, is not"}`);
      if (s.ask) console.log(`      ask:     ${s.ask}`);
    }
  }
  process.exit(0);
}

// Set one key inside a graded surface. JSON gets a DOTTED key; a flat
// `key: value` YAML / `key=value` file gets a whole-line replace. Anything else
// is refused with a reason — pretending to understand a file format is exactly
// the failure this lane's grading exists to avoid.
function setInFile(abs, key, value) {
  const text = fs.readFileSync(abs, "utf8");
  const ext = path.extname(abs).toLowerCase();
  if (ext === ".json") {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: "the file is not valid JSON right now — fix that first" };
    }
    const parts = key.split(".");
    let node = obj;
    for (const k of parts.slice(0, -1)) {
      if (typeof node[k] !== "object" || node[k] === null) return { ok: false, reason: `no such key path: ${key}` };
      node = node[k];
    }
    const last = parts[parts.length - 1];
    if (!(last in node)) return { ok: false, reason: `no such key: ${key} (this lane never CREATES keys, only changes them)` };
    const before = node[last];
    if (typeof before === "object") return { ok: false, reason: `${key} holds a structure, not a value` };
    node[last] = value;
    const nl = text.endsWith("\n") ? "\n" : "";
    const indent = /^\{\n(\s+)/.exec(text);
    fs.writeFileSync(abs, JSON.stringify(obj, null, indent ? indent[1].length : 2) + nl);
    return { ok: true, before: String(before), after: value };
  }
  if (ext === ".yaml" || ext === ".yml" || ext === ".env" || ext === ".properties" || ext === ".ini" || ext === ".toml") {
    const sep = ext === ".env" || ext === ".properties" ? "=" : ": ";
    const re = new RegExp("^(\\s*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*" + (sep === "=" ? "=" : ":") + "\\s*)(.*)$", "m");
    const m = re.exec(text);
    if (!m) return { ok: false, reason: `no such key: ${key} (this lane never CREATES keys, only changes them)` };
    fs.writeFileSync(abs, text.replace(re, (_, head) => head + value));
    return { ok: true, before: m[2].trim(), after: value };
  }
  return { ok: false, reason: `${ext || "this file type"} is not a format this lane edits — change it by hand` };
}

function handoffSet(claudeDir, id, key, value) {
  const asJson = wantsJson();
  const p = handoffPaths(claudeDir);
  const cfg = resolvedConfig(claudeDir);
  const fail = (reason, code) => {
    if (asJson) emitJson({ ok: false, reason, surface: id || null, key: key || null }, code);
    console.error("❌ " + reason);
    process.exit(code);
  };
  if (!isTrue(cfg.handoff_write)) fail("handoff_write is false — this project is map-only. `orc config set handoff_write true` to allow writes.", 1);
  if (!id || !key || value === undefined) fail("usage: orc handoff set <surface-id> <key> <value>", 1);
  const s = parseSurfaces(p.map).find((x) => x.id === id);
  if (!s) fail(`no such surface ${id} — run \`orc handoff surfaces\` for the list.`, 1);
  // A RED surface is NEVER edited, and the grade is never re-derived here to
  // make a change possible.
  if (s.grade === "red") fail(`${id} is RED: ${s.reason || "looks like content, is not"}. ORC will not touch it.${s.ask ? " Ask: " + s.ask : ""}`, 1);
  const abs = path.join(p.root, s.file);
  if (!fs.existsSync(abs)) fail(`${s.file} does not exist.`, 1);
  // The undo command is printed BEFORE the write, not after. In --json mode it
  // goes to STDERR instead of being dropped: stdout must stay exactly one
  // object, and the object already carries `revert` for the caller.
  const undoLine = `undo this with:  ${s.revert}`;
  if (asJson) process.stderr.write(undoLine + String.fromCharCode(10));
  else console.log(undoLine);
  const r = setInFile(abs, key, String(value));
  if (!r.ok) fail(r.reason, 1);
  const out = {
    ok: true,
    surface: id,
    file: s.file,
    grade: s.grade,
    key,
    before: r.before,
    after: r.after,
    revert: s.revert,
    check: s.check,
    // AMBER applies, then hands back the manual check as a TASK — never as a pass.
    check_kind: s.grade === "amber" ? "manual" : s.check_kind,
  };
  if (s.grade === "green" && s.check) {
    const run = spawnSync(s.check, { cwd: p.root, shell: true, encoding: "utf8", timeout: 10 * 60_000 });
    out.check_status = run.status === 0 ? "pass" : "fail";
    out.check_output = ((run.stdout || "") + (run.stderr || "")).trim().slice(-2000);
  }
  if (asJson) emitJson(out, 0);
  console.log(`✓ ${s.file}: ${key}\n    was:  ${r.before}\n    now:  ${r.after}`);
  if (out.check_status)
    console.log(
      out.check_status === "pass"
        ? `✓ the check passed:  ${s.check}`
        : `✗ the check FAILED:  ${s.check}\n  Undo:  ${s.revert}\n${String(out.check_output).split("\n").slice(-6).map((l) => "    " + l).join("\n")}`
    );
  else if (s.grade === "amber") console.log(`⚠ the check for this file is MANUAL, so nothing has verified your change yet:\n    ${s.check || "(see the map)"}`);
  console.log(`\nNothing was staged or committed. To commit:  git add ${s.file} && git commit`);
}

function handoff() {
  if (flag("--global")) {
    console.error("❌ orc handoff is project-scoped — the surfaces are this repo's files. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["handoff", <sub?>, ...]
  switch (pos[1]) {
    case undefined:
    case "surfaces":
      handoffSurfaces(claudeDir);
      break;
    case "set":
      handoffSet(claudeDir, pos[2], pos[3], pos.slice(4).join(" ") || undefined);
      break;
    default:
      console.error(
        `Unknown: orc handoff ${pos[1]}\n` +
          "Usage: orc handoff surfaces [--json]              the graded map (exit 0 = surfaces, 1 = none)\n" +
          "       orc handoff set <id> <key> <value>         change one value on a GREEN/AMBER surface"
      );
      process.exit(1);
  }
}

// ── /orc-aftermath (v0.46.0) — did the thing we shipped hold up ──────────────
//
// Everyone reaches for production telemetry. For a large class of outcomes THE
// REPOSITORY'S OWN FUTURE is the grading signal, and it is free: files rewritten
// soon after, a test we added deleted or skipped, the commit reverted, a promise
// that was HOLDING now BROKEN.
//
// THE RULE THAT KEEPS IT HONEST: churn is a SIGNAL, not a verdict. A file being
// rewritten is a fact; WHY is not knowable from git. This reports the signal and
// its strength. It never writes "this change was bad", never names a person, and
// never edits anything.

// Same rule as HANDOFF_MAP_REL: the report location is a registered contract
// token, so the literal lives here even though the SKILL is what writes the file.
const AFTERMATH_OUT_DIR = "orc-aftermath/";
const AFTERMATH_MIN_DAYS = 7;
const AFTERMATH_GRADES = { held: "HELD", churn: "CHURN", reverted: "REVERTED", recent: "TOO_RECENT", shallow: "SHALLOW" };

function parseSince(v) {
  const m = /^(\d+)\s*d?$/.exec(String(v || "").trim());
  return m ? Number(m[1]) : null;
}

function aftermathForRun(root, run, windowDays, pactLive) {
  const ageDays = (Date.now() - run.mtime) / 86400000;
  if (ageDays < AFTERMATH_MIN_DAYS)
    return { slug: run.slug, lane: run.lane, age_days: Math.round(ageDays), grade: AFTERMATH_GRADES.recent, signals: [], strength: 0, note: `younger than ${AFTERMATH_MIN_DAYS} days — too recent to grade. That is an answer, not a gap.` };

  const iso = new Date(run.mtime).toISOString();
  // The run's own commits: everything committed from the run's end onward, up to
  // one day after — the ship window. Deliberately coarse: a precise attribution
  // would need a commit id ORC does not record, and inventing one is worse.
  const own = gitIn(root, ["log", "--since", iso, "--until", new Date(run.mtime + 86400000).toISOString(), "--format=%H", "--no-merges"]);
  const shas = (own || "").split(/\r?\n/).filter(Boolean);
  if (!shas.length)
    return { slug: run.slug, lane: run.lane, age_days: Math.round(ageDays), grade: AFTERMATH_GRADES.shallow, signals: [], strength: 0, note: "no commit found in this run's ship window — nothing to grade against" };

  const files = new Set();
  for (const sha of shas)
    for (const f of (gitIn(root, ["show", "--name-only", "--format=", sha]) || "").split(/\r?\n/))
      if (f.trim()) files.add(f.trim());

  const signals = [];
  // 1. Reverted.
  const reverts = gitIn(root, ["log", "--since", iso, "--format=%H %s", "--no-merges", "--grep", "^Revert"]) || "";
  const revertHit = reverts
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((l) => shas.some((s) => l.includes(s.slice(0, 7))));
  if (revertHit.length) signals.push({ kind: "revert", strength: 3, detail: revertHit[0] });

  // 2. Shipped files rewritten since, inside the window.
  const later = gitIn(root, ["log", "--since", new Date(run.mtime + 86400000).toISOString(), "--format=%H", "--no-merges"]) || "";
  const laterShas = later.split(/\r?\n/).filter(Boolean);
  const rewritten = new Map();
  for (const sha of laterShas)
    for (const f of (gitIn(root, ["show", "--name-only", "--format=", sha]) || "").split(/\r?\n/)) {
      const t = f.trim();
      if (t && files.has(t)) rewritten.set(t, (rewritten.get(t) || 0) + 1);
    }
  if (rewritten.size)
    signals.push({
      kind: "churn",
      strength: rewritten.size >= 3 ? 2 : 1,
      detail: `${plural(rewritten.size, "shipped file")} rewritten within ${windowDays} days`,
      files: [...rewritten.keys()].slice(0, 8),
    });

  // 3. A test the run added that no longer exists, or is now skipped.
  const testFiles = [...files].filter((f) => /(^|\/)(test|tests|spec|__tests__)\//.test(f) || /\.(test|spec)\.[a-z]+$/.test(f));
  const goneTests = testFiles.filter((f) => !fs.existsSync(path.join(root, f)));
  if (goneTests.length) signals.push({ kind: "test-deleted", strength: 3, detail: `${plural(goneTests.length, "test file")} we added no longer exists`, files: goneTests.slice(0, 5) });
  const skipped = testFiles.filter((f) => {
    try {
      return /\b(it|test|describe)\.skip\b|\bxit\(|\bskip\s*=\s*true|@Ignore\b/.test(fs.readFileSync(path.join(root, f), "utf8"));
    } catch (_) {
      return false;
    }
  });
  if (skipped.length) signals.push({ kind: "test-skipped", strength: 2, detail: `${plural(skipped.length, "test file")} we added now contains a skip`, files: skipped.slice(0, 5) });

  // 4. A promise that used to hold and now does not, in this run's area.
  const broken = (pactLive || []).filter(
    (r) => r.state === "BROKEN" && (r.anchors || []).some((a) => files.has(String(a).split(":")[0]))
  );
  if (broken.length) signals.push({ kind: "promise-broken", strength: 3, detail: `${plural(broken.length, "promise")} anchored in this change is BROKEN`, ids: broken.map((r) => r.id) });

  const strength = signals.reduce((n, s) => Math.max(n, s.strength), 0);
  const grade = revertHit.length ? AFTERMATH_GRADES.reverted : signals.length ? AFTERMATH_GRADES.churn : AFTERMATH_GRADES.held;
  return {
    slug: run.slug,
    lane: run.lane,
    age_days: Math.round(ageDays),
    commits: shas.length,
    files: files.size,
    grade,
    strength,
    signals,
    note:
      grade === AFTERMATH_GRADES.held
        ? "no churn signal in the window. That is not proof it worked — only that nothing came back."
        : "signals, not a verdict: why a file changed again is not knowable from git.",
  };
}

function aftermathStatus(claudeDir) {
  const asJson = wantsJson();
  const cfg = resolvedConfig(claudeDir);
  const windowDays = parseSince(flag("--since")) || Number(cfg.aftermath_window_days) || 30;
  const root = repoRootOf(claudeDir);
  const { runs, dir } = listTraces(claudeDir);
  if (!gitIn(root, ["rev-parse", "--is-inside-work-tree"])) {
    if (asJson) emitJson({ ok: false, reason: "no-git", hint: "aftermath grades from git history — this is not a git work tree" }, 3);
    console.log("aftermath grades from git history — this is not a git work tree.");
    process.exit(3);
  }
  const cut = Date.now() - windowDays * 86400000;
  const inWindow = runs.filter((r) => r.mtime >= cut && r.slug);
  if (!inWindow.length) {
    if (asJson) emitJson({ ok: false, reason: "shallow", window_days: windowDays, log_dir: dir, runs: [] }, 3);
    console.log(`no runs in the last ${windowDays} days under ${dir} — history too shallow to grade.`);
    process.exit(3);
  }
  const p = pactRows(claudeDir);
  const rows = inWindow.map((r) => aftermathForRun(root, r, windowDays, p.error ? [] : p.rows));
  const counts = {};
  for (const r of rows) counts[r.grade] = (counts[r.grade] || 0) + 1;
  const code = counts[AFTERMATH_GRADES.reverted] ? 2 : counts[AFTERMATH_GRADES.churn] ? 1 : 0;

  if (asJson) emitJson({ ok: true, window_days: windowDays, log_dir: dir, counts, runs: rows }, code);

  console.log(ui.header(`ORC · aftermath — last ${windowDays} days, ${plural(rows.length, "run")}`));
  console.log("");
  for (const r of rows) {
    console.log(`  ${r.grade.padEnd(11)} ${r.slug}  (/${r.lane}, ${r.age_days}d)`);
    for (const s of r.signals) console.log(`  ${"".padEnd(11)} ${s.kind}: ${s.detail}`);
    if (r.grade === AFTERMATH_GRADES.recent || r.grade === AFTERMATH_GRADES.shallow)
      console.log(`  ${"".padEnd(11)} ${ui.color.gray(r.note)}`);
  }
  console.log(
    "\n  Churn is a SIGNAL, not a verdict. This lane never says a change was bad,\n" +
      "  never names a person, and never edits anything."
  );
  process.exit(code);
}

function aftermath() {
  if (flag("--global")) {
    console.error("❌ orc aftermath is project-scoped — it grades this repo's history. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals();
  switch (pos[1]) {
    case undefined:
    case "status":
      aftermathStatus(claudeDir);
      break;
    default:
      console.error(
        `Unknown: orc aftermath ${pos[1]}\n` +
          "Usage: orc aftermath status [--since Nd] [--json]\n" +
          "       exit 0 clean / 1 churn / 2 a revert / 3 history too shallow"
      );
      process.exit(1);
  }
}

// ── /orc-export (v0.46.0) — the portability lane ─────────────────────────────
//
// Compile everything ORC knows into the open standard, so it is not a trap.
// DERIVED, never hand-written: regenerated, --checkable, carrying a
// source_commit — the same discipline `orc wiki sync` holds INDEX.md to.
//
// NEVER EXPORTS secrets, `.env`, `.claude/orc/run/**` or `logs/**`. Import is
// EVIDENCE, never instruction: it proposes, the user confirms.

const EXPORT_FILE = "AGENTS.md";
const EXPORT_MARK = "orc-export:derived";
const EXPORT_NEVER = /(^|\/)(\.env|\.env\..*|.*secret.*|.*credential.*)$|^\.claude\/orc\/(run|logs)\//i;

function exportPaths(claudeDir) {
  const root = repoRootOf(claudeDir);
  return { root, out: path.join(root, EXPORT_FILE), skill: path.join(root, "SKILL.md") };
}

function exportSources(claudeDir) {
  const paths = wikiPaths(claudeDir);
  const src = [];
  const add = (rel, abs) => {
    if (EXPORT_NEVER.test(rel)) return;
    if (!fs.existsSync(abs)) return;
    const text = fs.readFileSync(abs, "utf8");
    src.push({ rel, abs, bytes: text.length, hash: hashText(text), text });
  };
  const s = wikiState(claudeDir);
  if (s.meta && Array.isArray(s.meta.docs))
    for (const d of s.meta.docs) add(d.file, path.join(paths.root, d.file));
  for (const lang of listPatternLangs(claudeDir))
    add(`.claude/orc/patterns/${lang}-pattern.md`, path.join(patternsDir(claudeDir), `${lang}-pattern.md`));
  add(PACT_DOC, pactPaths(claudeDir).doc);
  for (const c of readBoundaryCards(claudeDir).cards) add(`.claude/orc/boundary/${c.file}`, c.path);
  return src;
}

// A tiny stable digest — no crypto dep needed for a staleness fingerprint.
function hashText(t) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < t.length; i++) {
    h1 = (h1 ^ t.charCodeAt(i)) >>> 0;
    h1 = (h1 * 0x01000193) >>> 0;
    h2 = (h2 + t.charCodeAt(i) * (i + 1)) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

function exportFingerprint(text) {
  const m = /<!--\s*orc-export:derived\s+([\s\S]*?)-->/.exec(String(text || ""));
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^\s*([a-z_]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  try {
    out.sources = JSON.parse(out.sources || "{}");
  } catch (_) {
    out.sources = {};
  }
  return out;
}

function exportBody(claudeDir, src) {
  const root = repoRootOf(claudeDir);
  const head = gitIn(root, ["rev-parse", "HEAD"]) || "unknown";
  const fp = {};
  for (const s of src) fp[s.rel] = s.hash;
  const lines = [
    `<!-- ${EXPORT_MARK}`,
    `     source_commit: ${head}`,
    `     generated_at: ${fmtStamp(new Date())}`,
    `     generator: orc export`,
    `     sources: ${JSON.stringify(fp)}`,
    `     DO NOT HAND-EDIT — run \`orc export\` to regenerate, \`orc export --check\` to verify. -->`,
    "",
    `# AGENTS.md — ${path.basename(root)}`,
    "",
    "Portable agent context, compiled by ORC from this repo's own derived knowledge.",
    "Open standard: any agent that reads AGENTS.md can use this. Nothing here is",
    "hand-written — regenerate it rather than editing it.",
    "",
  ];
  const groups = [
    ["Orientation", src.filter((s) => /orc-orientation/.test(s.rel))],
    ["Promises this project makes", src.filter((s) => s.rel === PACT_DOC)],
    ["Where an agent should not act alone", src.filter((s) => s.rel.startsWith(".claude/orc/boundary/"))],
    ["Code conventions", src.filter((s) => s.rel.includes("/patterns/"))],
    ["Architecture and features", src.filter((s) => s.rel.startsWith("wiki/") && !/orc-orientation/.test(s.rel))],
  ];
  for (const [title, items] of groups) {
    if (!items.length) continue;
    lines.push(`## ${title}`, "");
    for (const s of items) {
      lines.push(`### ${s.rel}`, "");
      // Strip each source's own frontmatter — it is ORC's bookkeeping, not
      // portable context — and never re-wrap the prose.
      lines.push(s.text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim(), "");
    }
  }
  lines.push("---", "", `Compiled from ${plural(src.length, "source")} at commit ${String(head).slice(0, 8)}.`, "");
  return lines.join("\n");
}

function exportCmd() {
  if (flag("--global")) {
    console.error("❌ orc export is project-scoped — it compiles this repo's knowledge. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = positionals(); // ["export", <sub?>]
  const p = exportPaths(claudeDir);
  const asJson = wantsJson();
  if (pos[1] === "import") return exportImport(claudeDir);
  const src = exportSources(claudeDir);
  const check = flag("--check") === true;

  if (!src.length) {
    const hint = "nothing to export yet — build a wiki (`/orc-wiki`), a pattern (`/orc-pattern`), a pact (`/orc-pact`) or boundary cards (`/orc-boundary`) first.";
    if (asJson) emitJson({ ok: false, reason: "no-sources", out: p.out, sources: [], hint }, 3);
    console.log(hint);
    process.exit(3);
  }

  if (check) {
    const cur = fs.existsSync(p.out) ? fs.readFileSync(p.out, "utf8") : null;
    const fp = cur ? exportFingerprint(cur) : null;
    const drifted = [];
    for (const s of src) if (!fp || fp.sources[s.rel] !== s.hash) drifted.push(s.rel);
    const removed = fp ? Object.keys(fp.sources).filter((k) => !src.some((s) => s.rel === k)) : [];
    const stale = !cur || !fp || drifted.length || removed.length;
    if (asJson)
      emitJson({ ok: !stale, out: p.out, exists: !!cur, source_commit: fp ? fp.source_commit : null, sources: src.length, drifted, removed, stale }, stale ? 1 : 0);
    if (!cur) {
      console.log(`${EXPORT_FILE} does not exist — run \`orc export\`.`);
      process.exit(1);
    }
    if (!stale) {
      console.log(`✓ ${EXPORT_FILE} is current — ${plural(src.length, "source")}, all fingerprints match.`);
      process.exit(0);
    }
    console.log(`⚠ ${EXPORT_FILE} is STALE:`);
    for (const d of drifted) console.log(`  changed since export: ${d}`);
    for (const d of removed) console.log(`  no longer a source:   ${d}`);
    console.log(`  Regenerate:  orc export`);
    process.exit(1);
  }

  const body = exportBody(claudeDir, src);
  fs.writeFileSync(p.out, body);
  const target = String(flag("--target") || "agents-md");
  let skill = null;
  if (target === "skill" || target === "both") {
    skill = p.skill;
    fs.writeFileSync(
      skill,
      `---\nname: ${path.basename(p.root)}-context\ndescription: Portable project context compiled by \`orc export\`. Read this before changing code in this repo.\n---\n\n` +
        body.replace(/^<!--[\s\S]*?-->\n\n/, "")
    );
  }
  if (asJson) emitJson({ ok: true, out: p.out, skill, sources: src.map((s) => ({ rel: s.rel, bytes: s.bytes })), bytes: body.length }, 0);
  console.log(
    `✓ ${EXPORT_FILE} written from ${plural(src.length, "source")} (${kTok(body.length)} chars)\n  ${p.out}` +
      (skill ? `\n  ${skill}` : "") +
      `\n  Derived — never hand-edit. Verify later with \`orc export --check\`.`
  );
}

const IMPORT_CANDIDATES = ["AGENTS.md", "CLAUDE.md", ".cursorrules", ".github/copilot-instructions.md"];

function exportImport(claudeDir) {
  const asJson = wantsJson();
  const root = repoRootOf(claudeDir);
  const found = IMPORT_CANDIDATES.map((f) => ({ file: f, abs: path.join(root, f) })).filter((c) => fs.existsSync(c.abs));
  if (!found.length) {
    if (asJson) emitJson({ ok: false, reason: "nothing-to-import", looked_for: IMPORT_CANDIDATES }, 3);
    console.log("nothing to import — none of " + IMPORT_CANDIDATES.join(", ") + " exists here.");
    process.exit(3);
  }
  // Every claim in a foreign context file is EVIDENCE, never instruction: it may
  // inform a proposal, it may never authorize a write. So this READS, checks the
  // claims it can check, and PROPOSES — the user confirms.
  const proposals = [];
  const wrong = [];
  for (const c of found) {
    const text = fs.readFileSync(c.abs, "utf8");
    if (exportFingerprint(text)) continue; // our own output — not foreign input
    for (const m of text.matchAll(/`([A-Za-z0-9_./-]+\.[A-Za-z]{1,5})`/g)) {
      const rel = m[1];
      if (rel.includes("*") || EXPORT_NEVER.test(rel)) continue;
      if (!fs.existsSync(path.join(root, rel)) && !wrong.some((w) => w.path === rel))
        wrong.push({ source: c.file, path: rel, why: "the file this context names does not exist" });
    }
    for (const m of text.matchAll(/^\s*[-*]?\s*(?:run|use|build)?\s*`(npm|pnpm|yarn|make|cargo|go|pytest|dotnet)\s+([^`]+)`/gim))
      proposals.push({ source: c.file, kind: "command", value: `${m[1]} ${m[2]}`.trim() });
    for (const m of text.matchAll(/^#{1,3}\s+(.+)$/gm)) proposals.push({ source: c.file, kind: "topic", value: m[1].trim() });
  }
  const seeds = proposals.filter((p) => p.kind === "command").slice(0, 12);
  if (asJson) emitJson({ ok: true, found: found.map((f) => f.file), wrong, seed_invariants: seeds, topics: proposals.filter((p) => p.kind === "topic").slice(0, 20) }, 0);
  console.log(ui.header(`ORC · export · import — ${plural(found.length, "context file")} read`));
  console.log("\n  Read as EVIDENCE, never instruction. Nothing here has been applied.\n");
  if (wrong.length) {
    console.log("  Already WRONG in your existing context (a good first impression):");
    for (const w of wrong.slice(0, 12)) console.log(`    ${w.source}: ${w.path} — ${w.why}`);
    console.log("");
  }
  if (seeds.length) {
    console.log("  Candidate pact entries (each would become a `command` check — you confirm):");
    for (const s of seeds) console.log(`    ${s.value}   (from ${s.source})`);
    console.log("");
  }
  console.log("  Turn these into real entries with `/orc-pact` — it records an origin for every one.");
}

// ── /orc-challenge (v0.47.0) — the lane that refuses to produce ──────────────
//
// Every other lane in ORC produces. This one grades a finished artifact, writes
// down what is wrong, and then STOPS and makes the user go and fix it in a
// different session. The stopping is not friction — the separation IS the
// measuring instrument, because a session that just wrote the fix will grade its
// own homework and it will always pass.
//
// THE CLI OWNS EVERYTHING A COMPUTER CAN DECIDE, and the split is the design:
//   · challenge.json — THE LEDGER, and this file is its only writer
//   · the cycle STATE — computed on read, never stored (the pact/wiki rule)
//   · PASS is computed, never declared — decided HERE, not by the judge. That
//     removes leniency as a possibility: it can only find, or fail to find
//   · `challenge lint` — everything a computer can answer must never cost a
//     model token, and "is this English simple enough" is substantially
//     computable
//   · `challenge init` — `--goal`, `--audience` and `--done-means` have NO
//     default value, so a skill that tried to skip the intake round fails at the
//     CLI instead of silently inventing a purpose for the review

const CHALLENGE_DIR = "orc/orc-challenge/";
const CHALLENGE_LEDGER = "challenge.json";
const CHALLENGE_DOC = "CHALLENGE.md";
const CHALLENGE_GOALS = "goals.md";
const CHALLENGE_TEMPLATE = "template.md";
const CHALLENGE_DIMS = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"];
const CHALLENGE_KINDS = ["tsd", "prd", "adr", "api-contract", "readme", "runbook", "plan", "code", "mixed"];
const CHALLENGE_SEVERITIES = ["P0", "P1", "P2", "P3"];
// Conservation (rule 4): every carried finding gets exactly ONE of these, with a
// reason. A silently dropped finding is indistinguishable from a fixed one.
const CHALLENGE_OUTCOMES = ["resolved", "still-open", "superseded", "withdrawn", "accepted"];
// The state word list. Mirrored in references/cycle-state.md — documented drift
// the token lint cannot see (a word list is not a single token), so a golden test
// compares the two.
const CHALLENGE_STATES = [
  "AWAITING-JUDGE",
  "AWAITING-FIX",
  "AWAITING-RECHECK",
  "PASSED",
  "STALE-PASS",
  "MISSING-REVISION",
  "TAMPERED",
];
const CHALLENGE_REVISION_MODES = ["in-place", "new-file", "directory"];
// The goal elements a finding may claim to serve. A finding that cannot be traced
// to one is OUT OF SCOPE and is dropped by `record` — rule 0, made structural.
const CHALLENGE_SERVES = ["goal", "audience", "done_means", "out_of_scope"];

// `flag()` returns only the FIRST occurrence and `positionals()` knows only three
// value-taking flags. Intake collects repeatable ones (--artifact, --out-of-scope,
// --context-ref), so this family reads its own arguments.
const CHALLENGE_VALUE_FLAGS = [
  "--artifact", "--kind", "--goal", "--audience", "--done-means", "--out-of-scope",
  "--context-ref", "--template", "--dimensions", "--revision", "--revision-pattern",
  "--iteration", "--from", "--set", "--reason", "--dir", "--preset",
];

function chPositionals() {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--global") continue;
    if (CHALLENGE_VALUE_FLAGS.includes(a)) {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    out.push(a);
  }
  return out;
}

function chOptAll(name) {
  const out = [];
  for (let i = 0; i < args.length; i++)
    if (args[i] === name && args[i + 1] !== undefined && !String(args[i + 1]).startsWith("--"))
      out.push(String(args[i + 1]));
  return out;
}
const chOpt = (name) => {
  const v = chOptAll(name);
  return v.length ? v[0] : undefined;
};

const chSlug = (raw) =>
  String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

function challengePaths(claudeDir, slug) {
  const root = repoRootOf(claudeDir);
  const dir = path.join(root, ...CHALLENGE_DIR.split("/").filter(Boolean));
  const cycle = slug ? path.join(dir, slug) : null;
  return {
    root,
    dir,
    cycle,
    ledger: cycle ? path.join(cycle, CHALLENGE_LEDGER) : null,
    goals: cycle ? path.join(cycle, CHALLENGE_GOALS) : null,
    template: cycle ? path.join(cycle, CHALLENGE_TEMPLATE) : null,
    doc: cycle ? path.join(cycle, CHALLENGE_DOC) : null,
  };
}

const shaOfFile = (abs) => {
  try {
    return sha256(fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n"));
  } catch (_) {
    return null;
  }
};
const shortSha = (s) => (s ? String(s).slice(0, 8) : "—");

function readCycle(claudeDir, slug) {
  const p = challengePaths(claudeDir, slug);
  if (!p.ledger || !fs.existsSync(p.ledger)) return null;
  try {
    const c = JSON.parse(fs.readFileSync(p.ledger, "utf8"));
    c.iterations = Array.isArray(c.iterations) ? c.iterations : [];
    c.artifacts = Array.isArray(c.artifacts) ? c.artifacts : [];
    c.dimensions = Array.isArray(c.dimensions) ? c.dimensions : CHALLENGE_DIMS.slice(0, 6);
    c.accepted = c.accepted || {};
    c.rebuttals = c.rebuttals || {};
    c.events = Array.isArray(c.events) ? c.events : [];
    return c;
  } catch (_) {
    return null;
  }
}

// THE LEDGER HAS EXACTLY ONE WRITER (rule 10) — this function, reached only from
// an `orc challenge` subcommand. A model never edits challenge.json.
function writeCycle(claudeDir, slug, cyc) {
  const p = challengePaths(claudeDir, slug);
  fs.mkdirSync(p.cycle, { recursive: true });
  cyc.version = 1;
  cyc.updated_at = fmtStamp(new Date());
  fs.writeFileSync(p.ledger, JSON.stringify(cyc, null, 2) + "\n");
  return p.ledger;
}

function listCycleSlugs(claudeDir) {
  const p = challengePaths(claudeDir);
  if (!fs.existsSync(p.dir)) return [];
  return fs
    .readdirSync(p.dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(p.dir, e.name, CHALLENGE_LEDGER)))
    .map((e) => e.name)
    .sort();
}

const iterDir = (n) => "iteration-" + String(n).padStart(2, "0");

// ── the open finding set ────────────────────────────────────────────────────
// Everything downstream (PASS, coverage, the convergence chart, the fix brief)
// reads this one function, so there is exactly one idea of "still open".
function challengeOpen(cyc) {
  const last = cyc.iterations[cyc.iterations.length - 1];
  if (!last) return [];
  return (last.findings || []).filter((f) => {
    if (cyc.accepted[f.id]) return false;
    const o = f.outcome;
    return o === null || o === undefined || o === "still-open";
  });
}

const sevRank = (s) => CHALLENGE_SEVERITIES.indexOf(String(s || "P3").toUpperCase());

function challengeBlocking(cyc, cfg) {
  const bar = sevRank(String(cfg.challenge_pass_severity || "p1").toUpperCase());
  return challengeOpen(cyc).filter((f) => sevRank(f.severity) <= bar);
}

function challengeCounts(cyc) {
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0, accepted: 0, rebutted: 0 };
  for (const f of challengeOpen(cyc)) counts[String(f.severity || "P3").toUpperCase()]++;
  counts.accepted = Object.keys(cyc.accepted || {}).length;
  counts.rebutted = Object.values(cyc.rebuttals || {}).filter((r) => r.status === "open").length;
  return counts;
}

// ── where the revision goes (§13.3) ─────────────────────────────────────────
// Declared at intake, so the resumed session NEVER has to ask "where did you put
// the fixed version?". That is a fact the cycle already owns, and asking for it
// is rule 0's failure mode in miniature.
function challengeExpected(cyc) {
  const rev = cyc.revision || { mode: "in-place" };
  const first = (cyc.artifacts[0] || {}).path || "";
  if (rev.expect_override) return rev.expect_override;
  // Before iteration 1 there is no revision yet — what gets judged is the
  // artifact the user brought.
  if (!cyc.iterations.length) return first;
  if (rev.mode === "new-file" && rev.pattern)
    return String(rev.pattern).replace(/\{n\}/g, String(cyc.iterations.length + 1));
  if (rev.mode === "directory" && rev.pattern) return String(rev.pattern);
  return first;
}

function challengeTampered(claudeDir, slug, cyc) {
  const p = challengePaths(claudeDir, slug);
  for (const it of cyc.iterations) {
    if (!it.verdict_file || !it.verdict_file_sha) continue;
    const abs = path.join(p.cycle, it.verdict_file);
    const now = shaOfFile(abs);
    if (now === null) return { iteration: it.n, why: `verdict file is gone: ${it.verdict_file}` };
    if (now !== it.verdict_file_sha)
      return { iteration: it.n, why: `${it.verdict_file} changed after it was recorded` };
  }
  return null;
}

// Nothing below is stored. Same rule as a wiki tier and a pact state: a stored
// status is a status that lies the moment somebody saves a file.
function challengeStateOf(claudeDir, slug, cyc, cfg) {
  const p = challengePaths(claudeDir, slug);
  const tam = challengeTampered(claudeDir, slug, cyc);
  if (tam)
    return { state: "TAMPERED", why: `${tam.why} — reported, never silently re-graded` };
  if (!cyc.iterations.length)
    return { state: "AWAITING-JUDGE", why: "created, not yet judged" };
  const last = cyc.iterations[cyc.iterations.length - 1];
  const changed = (cyc.artifacts || []).filter((a) => {
    const now = shaOfFile(path.join(p.root, a.path));
    const then = (last.artifact_shas || {})[a.path];
    return now !== null && then && now !== then;
  });
  // `last.passed` is the verdict's own HISTORY — it is what the convergence
  // chart draws, and it never changes. The STATE is recomputed live from the
  // open set, in BOTH directions: an accepted exception clears a block the
  // moment it is recorded (otherwise the escape valve does not escape until one
  // more paid iteration has run), and raising `challenge_pass_severity`
  // un-passes a cycle immediately (otherwise a stored verdict outranks the bar
  // the user just set — which is exactly the stored-status lie this whole file
  // avoids everywhere else).
  const liveBlocking = challengeBlocking(cyc, cfg);
  if (liveBlocking.length === 0)
    return changed.length
      ? {
          state: "STALE-PASS",
          why: `passed at iteration ${last.n}, but ${plural(changed.length, "artifact")} changed afterwards — honest, not a failure`,
        }
      : { state: "PASSED", why: `passed at iteration ${last.n}; nothing has changed since` };
  const expected = challengeExpected(cyc);
  const expectedAbs = path.join(p.root, expected);
  if (!fs.existsSync(expectedAbs))
    return {
      state: "MISSING-REVISION",
      why: `the declared revision ${expected} does not exist — candidates are listed, never adopted`,
    };
  const expSha = shaOfFile(expectedAbs);
  const expThen = (last.artifact_shas || {})[expected];
  if (changed.length || (expThen && expSha !== expThen))
    return { state: "AWAITING-RECHECK", why: "the artifact moved since the last verdict — a new iteration is warranted" };
  return {
    state: "AWAITING-FIX",
    why: `${plural(challengeBlocking(cyc, cfg).length, "blocking finding")} open and nothing has changed yet`,
  };
}

// `stalled` is a FLAG that rides alongside the state, never a state of its own —
// a state that means two things is a state that lies. And it is a measurement,
// not a cap (§19): each turn of this loop is a separate human sitting down to
// work, so refusing on iteration 6 would be refusing to review a hard document.
function challengeStalled(cyc, cfg) {
  const n = Math.max(2, Number(cfg.challenge_stall_after || 3));
  const conv = cyc.iterations.map((it) => Number(it.blocking || 0));
  if (conv.length < n) return false;
  const window = conv.slice(-n);
  return window[window.length - 1] >= window[0];
}

function challengeDimensionRows(cyc) {
  const last = cyc.iterations[cyc.iterations.length - 1];
  const reported = new Map(((last && last.dimensions) || []).map((d) => [d.id, d]));
  return CHALLENGE_DIMS.map((id) => {
    if (!cyc.dimensions.includes(id)) return { id, status: "NOT-SELECTED" };
    const r = reported.get(id);
    if (!r) return { id, status: "NOT-CHECKED", reason: "not yet judged" };
    return {
      id,
      status: r.status,
      findings: r.findings === undefined ? 0 : r.findings,
      ...(r.score ? { score: r.score } : {}),
      ...(r.reason ? { reason: r.reason } : {}),
    };
  });
}

function challengeView(claudeDir, slug, cfg) {
  const cyc = readCycle(claudeDir, slug);
  if (!cyc) return null;
  const p = challengePaths(claudeDir, slug);
  const st = challengeStateOf(claudeDir, slug, cyc, cfg);
  const counts = challengeCounts(cyc);
  const last = cyc.iterations[cyc.iterations.length - 1] || null;
  const expected = challengeExpected(cyc);
  const blocking = challengeBlocking(cyc, cfg);
  return {
    cyc,
    paths: p,
    state: st.state,
    why: st.why,
    counts,
    blocking,
    expected,
    stalled: challengeStalled(cyc, cfg),
    no_template: !!cyc.no_template,
    dimensions: challengeDimensionRows(cyc),
    last,
    convergence: cyc.iterations.map((it) => ({
      n: it.n,
      blocking: Number(it.blocking || 0),
      passed: !!it.passed,
      graded_against: it.graded_against || 1,
      graded_against_goal: it.graded_against_goal || 1,
      severities: it.severities || {},
    })),
  };
}

// A blocking finding is what raises the code; a P0 raises it further. UNCHECKED
// dimensions never raise it — rule 6 makes them LOUD, not fatal.
function challengeCode(v) {
  // A tampered ledger is never "passed": the evidence under the verdict moved,
  // so the honest answer is the same tier as a P0 — report it, never re-grade it.
  if (v.state === "TAMPERED") return 2;
  if (v.state === "PASSED") return 0;
  if (v.counts.P0) return 2;
  return v.blocking.length ? 1 : v.state === "STALE-PASS" ? 1 : 0;
}

function challengeLine(slug, v) {
  return (
    `challenge: ${slug} ${v.state}` +
    (v.blocking.length ? ` — ${plural(v.blocking.length, "blocking finding")} open` : "") +
    (v.no_template ? " · no template (D1 NOT-CHECKED)" : "") +
    (v.stalled ? " · stalled" : "")
  );
}

// ── orc challenge init ──────────────────────────────────────────────────────
function challengeInit(claudeDir) {
  const asJson = wantsJson();
  const pos = chPositionals(); // ["challenge","init",<slug?>]
  const artifacts = chOptAll("--artifact");
  const goal = chOpt("--goal");
  const audience = chOpt("--audience");
  const doneMeans = chOpt("--done-means");
  const slug = chSlug(pos[2] || (artifacts[0] ? path.basename(artifacts[0]).replace(/\.[a-z]+$/i, "") : ""));
  const fail = (reason, hint) => {
    if (asJson) emitJson({ ok: false, reason, hint }, 2);
    console.error("❌ " + hint);
    process.exit(2);
  };

  if (!slug) fail("no-slug", "orc challenge init needs a slug (or an --artifact to derive one from).");
  if (!artifacts.length) fail("no-artifact", "orc challenge init needs at least one --artifact <path>.");

  // RULE 0, MADE STRUCTURAL. These three have no fallback value: a finding is
  // only a finding relative to a goal, and a *defensible* finding about the
  // wrong thing is worse than an obviously wrong one, because the user spends
  // three iterations fixing what did not matter.
  for (const [flagName, val] of [["--goal", goal], ["--audience", audience], ["--done-means", doneMeans]])
    if (!val || !String(val).trim())
      fail(
        "missing-goal-field",
        `${flagName} is required and has no default. ORC never guesses what "good" means here — ` +
          `ask the user and pass their words. (a lane that guesses the user's goal has broken this contract)`
      );

  const p = challengePaths(claudeDir, slug);
  if (fs.existsSync(p.ledger)) fail("exists", `a cycle named ${slug} already exists at ${p.cycle}.`);

  const templateSrc = chOpt("--template");
  const noTemplate = args.includes("--no-template");
  if (!templateSrc && !noTemplate)
    fail(
      "no-template",
      "supply --template <path> (it is copied and FROZEN), or pass --no-template after an explicit " +
        '"I have no template" — D1 is then reported NOT-CHECKED with that reason, never silently skipped.'
    );

  const kind = (chOpt("--kind") || "tsd").toLowerCase();
  if (!CHALLENGE_KINDS.includes(kind))
    fail("bad-kind", `--kind must be one of: ${CHALLENGE_KINDS.join(", ")}`);

  const dimsRaw = chOpt("--dimensions");
  const dims = dimsRaw
    ? dimsRaw.split(/[,\s]+/).map((d) => d.trim().toUpperCase()).filter(Boolean)
    : CHALLENGE_DIMS.slice(0, 6);
  for (const d of dims) if (!CHALLENGE_DIMS.includes(d)) fail("bad-dimension", `unknown dimension ${d} (valid: ${CHALLENGE_DIMS.join(", ")})`);

  const revMode = (chOpt("--revision") || "in-place").toLowerCase();
  if (!CHALLENGE_REVISION_MODES.includes(revMode))
    fail("bad-revision", `--revision must be one of: ${CHALLENGE_REVISION_MODES.join(", ")}`);
  const revPattern = chOpt("--revision-pattern");
  if (revMode !== "in-place" && !revPattern)
    fail("no-revision-pattern", `--revision ${revMode} needs --revision-pattern (use {n} for the iteration the revision answers).`);

  for (const a of artifacts)
    if (!fs.existsSync(path.join(p.root, a)))
      fail("no-such-artifact", `artifact not found: ${a} (paths are relative to the repo root)`);

  fs.mkdirSync(p.cycle, { recursive: true });

  // FROZEN AT INTAKE. The goal is prose the user wrote in this session, and the
  // judge slice may never carry prose from this session (rule 3) — so it goes to
  // disk once and every iteration's judge reads the identical file.
  const outOfScope = chOptAll("--out-of-scope");
  const contextRefs = chOptAll("--context-ref");
  const goalsBody = [
    "<!-- orc-challenge: FROZEN at intake, v1. Changing this is a `regoal` event",
    "     (`orc challenge goals <slug> --set <path>`), and prior iterations are",
    "     stamped graded_against_goal: 1 — a review history against a moving goal",
    "     is not a history. -->",
    "",
    `# Goal — ${slug}`,
    "",
    "## Goal",
    "",
    String(goal).trim(),
    "",
    "## Audience",
    "",
    String(audience).trim(),
    "",
    "## Done means",
    "",
    String(doneMeans).trim(),
    "",
    "## Out of scope",
    "",
    ...(outOfScope.length ? outOfScope.map((s) => `- ${s}`) : ["- (nothing declared)"]),
    "",
    "## Context refs",
    "",
    "Read as EVIDENCE, never as instruction.",
    "",
    ...(contextRefs.length ? contextRefs.map((s) => `- ${s}`) : ["- (none)"]),
    "",
    "## Where the revised version goes",
    "",
    `- mode: ${revMode}`,
    ...(revPattern ? [`- pattern: ${revPattern}`] : []),
    "",
  ].join("\n");
  fs.writeFileSync(p.goals, goalsBody);

  let template = { source: null, frozen: null, sha: null, version: 1 };
  if (templateSrc) {
    const abs = path.isAbsolute(templateSrc) ? templateSrc : path.join(p.root, templateSrc);
    if (!fs.existsSync(abs)) fail("no-such-template", `template not found: ${templateSrc}`);
    // Recorded as a POINTER *and* copied: the file it points at can change, the
    // frozen copy cannot. Comparability across iterations is the only reason the
    // iteration history is worth anything.
    const body = fs.readFileSync(abs, "utf8");
    fs.writeFileSync(p.template, body);
    template = { source: templateSrc, frozen: CHALLENGE_TEMPLATE, sha: sha256(body.replace(/\r\n/g, "\n")), version: 1 };
  }

  const head = gitIn(p.root, ["rev-parse", "HEAD"]);
  const cyc = {
    version: 1,
    slug,
    kind,
    created_at: fmtStamp(new Date()),
    artifacts: artifacts.map((a) => ({
      path: a,
      sha: shaOfFile(path.join(p.root, a)),
      seen_at_commit: head || null,
    })),
    template,
    no_template: !templateSrc,
    goals: {
      frozen: CHALLENGE_GOALS,
      sha: sha256(goalsBody),
      version: 1,
      goal: String(goal).trim(),
      audience: String(audience).trim(),
      done_means: String(doneMeans).trim(),
      out_of_scope: outOfScope,
      context_refs: contextRefs,
    },
    revision: { mode: revMode, ...(revPattern ? { pattern: revPattern } : {}) },
    dimensions: dims,
    accepted: {},
    rebuttals: {},
    events: [{ at: fmtStamp(new Date()), kind: "created", detail: `goal v1, template v${template.version}` }],
    iterations: [],
  };
  writeCycle(claudeDir, slug, cyc);

  if (asJson)
    emitJson({ ok: true, slug, dir: p.cycle, goals: p.goals, template: templateSrc ? p.template : null, no_template: !templateSrc, dimensions: dims, revision: cyc.revision }, 0);
  console.log(ui.header(`ORC · challenge — ${slug} created`));
  console.log(`\n  goal frozen:  ${p.goals}`);
  console.log(`  template:     ${templateSrc ? p.template + "  (frozen v1)" : "none — D1 will report NOT-CHECKED with that reason"}`);
  console.log(`  dimensions:   ${dims.join(" ")}`);
  console.log(`  revision:     ${revMode}${revPattern ? " — " + revPattern : " (the artifact's own path)"}`);
  console.log(`\n  Next:  /orc-challenge ${slug}`);
  process.exit(0);
}

// ── orc challenge list / status / show ──────────────────────────────────────
function challengeList(claudeDir) {
  const asJson = wantsJson();
  const cfg = resolvedConfig(claudeDir);
  const slugs = listCycleSlugs(claudeDir);
  if (!slugs.length) {
    const hint = "no challenge cycles yet — run `/orc-challenge` to open one (it asks for the goal first, and never guesses it).";
    if (asJson) emitJson({ ok: false, reason: "no-cycles", cycles: [], hint }, 3);
    console.log(hint);
    process.exit(3);
  }
  const rows = slugs.map((s) => {
    const v = challengeView(claudeDir, s, cfg);
    return {
      slug: s,
      kind: v.cyc.kind,
      state: v.state,
      why: v.why,
      iterations: v.cyc.iterations.length,
      blocking: v.blocking.length,
      counts: v.counts,
      stalled: v.stalled,
      no_template: v.no_template,
      goal: v.cyc.goals.goal,
      next: v.state === "PASSED" ? null : `/orc-challenge ${s}`,
    };
  });
  const inFlight = rows.filter((r) => r.state !== "PASSED");
  const code = inFlight.length ? 1 : 0;
  if (asJson) emitJson({ ok: true, cycles: rows, in_flight: inFlight.length }, code);
  console.log(ui.header(`ORC · challenge — ${plural(rows.length, "cycle")}`));
  console.log("");
  for (const r of rows) {
    console.log(`  ${r.state.padEnd(17)} ${r.slug}  ${ui.color.gray(r.kind)}`);
    console.log(`  ${"".padEnd(17)} ${ui.color.gray(r.why)}`);
    if (r.stalled) console.log(`  ${"".padEnd(17)} ⚠ stalled — no net reduction in ${cfg.challenge_stall_after} iterations`);
  }
  console.log("\n  ORC judges, you fix, ORC re-judges — and it never fixes what it judged.");
  process.exit(code);
}

function challengeStatus(claudeDir, slugArg) {
  const asJson = wantsJson();
  const cfg = resolvedConfig(claudeDir);
  const slug = chSlug(slugArg);
  const v = slug ? challengeView(claudeDir, slug, cfg) : null;
  if (!v) {
    const hint = `no challenge cycle "${slugArg || ""}" — \`orc challenge list\` shows the ones that exist.`;
    if (asJson) emitJson({ ok: false, reason: "no-such-cycle", slug: slugArg || null, hint }, 3);
    console.log(hint);
    process.exit(3);
  }
  const code = challengeCode(v);
  const expectedAbs = path.join(v.paths.root, v.expected);
  const payload = {
    ok: true,
    slug,
    state: v.state,
    why: v.why,
    stalled: v.stalled,
    no_template: v.no_template,
    kind: v.cyc.kind,
    goals: {
      version: v.cyc.goals.version,
      goal: v.cyc.goals.goal,
      audience: v.cyc.goals.audience,
      done_means: v.cyc.goals.done_means,
      out_of_scope: v.cyc.goals.out_of_scope || [],
      context_refs: v.cyc.goals.context_refs || [],
    },
    template: { ...v.cyc.template, no_template: v.no_template },
    iterations: v.cyc.iterations.length,
    artifacts: (v.cyc.artifacts || []).map((a) => ({
      path: a.path,
      changed_since_verdict:
        !!v.last && shaOfFile(path.join(v.paths.root, a.path)) !== (v.last.artifact_shas || {})[a.path],
    })),
    revision: {
      mode: (v.cyc.revision || {}).mode || "in-place",
      pattern: (v.cyc.revision || {}).pattern || null,
      expected: v.expected,
      found: fs.existsSync(expectedAbs),
    },
    counts: v.counts,
    dimensions: v.dimensions,
    convergence: v.convergence,
    dir: v.paths.cycle,
    next: v.state === "PASSED" ? null : `/orc-challenge ${slug}`,
    preflight_line: challengeLine(slug, v),
  };
  if (asJson) emitJson(payload, code);
  console.log(ui.header(`ORC · challenge — ${slug}`));
  console.log(`\n  ${v.state}  ${ui.color.gray(v.why)}`);
  console.log(`\n  goal (v${v.cyc.goals.version}): ${v.cyc.goals.goal}`);
  console.log(`  audience:   ${v.cyc.goals.audience}`);
  console.log(`  done means: ${v.cyc.goals.done_means}`);
  console.log(
    `\n  iterations: ${v.cyc.iterations.length}` +
      `   open: P0 ${v.counts.P0} · P1 ${v.counts.P1} · P2 ${v.counts.P2} · P3 ${v.counts.P3}` +
      (v.counts.accepted ? ` · ${v.counts.accepted} accepted` : "") +
      (v.counts.rebutted ? ` · ${v.counts.rebutted} rebutted` : "")
  );
  console.log(`  dimensions: ${v.dimensions.map((d) => d.id + " " + d.status).join(" · ")}`);
  if (v.state !== "PASSED")
    console.log(`  revision:   ${v.expected}  ${fs.existsSync(expectedAbs) ? "FOUND" : "MISSING"}`);
  if (v.stalled)
    console.log(
      `\n  ⚠ stalled — no net reduction in ${cfg.challenge_stall_after} iterations. Three honest options:\n` +
        `      1  Narrow the rubric      orc challenge init … --dimensions D1,D2,D6\n` +
        `      2  Accept a known gap     orc challenge accept ${slug} <id> "reason"\n` +
        `      3  Keep going             /orc-challenge ${slug}`
    );
  if (payload.next) console.log(`\n  Next:  ${payload.next}`);
  process.exit(code);
}

function challengeShow(claudeDir, slugArg) {
  const asJson = wantsJson();
  const cfg = resolvedConfig(claudeDir);
  const slug = chSlug(slugArg);
  const v = slug ? challengeView(claudeDir, slug, cfg) : null;
  if (!v) {
    if (asJson) emitJson({ ok: false, reason: "no-such-cycle", slug: slugArg || null }, 3);
    console.log(`no challenge cycle "${slugArg || ""}".`);
    process.exit(3);
  }
  const want = chOpt("--iteration");
  const iters = want ? v.cyc.iterations.filter((it) => String(it.n) === String(Number(want))) : v.cyc.iterations;
  const payload = {
    ok: true,
    slug,
    state: v.state,
    kind: v.cyc.kind,
    goals: v.cyc.goals,
    template: v.cyc.template,
    no_template: v.no_template,
    dimensions_selected: v.cyc.dimensions,
    accepted: v.cyc.accepted,
    rebuttals: v.cyc.rebuttals,
    events: v.cyc.events,
    revision: { ...(v.cyc.revision || {}), expected: v.expected },
    iterations: iters,
    open: challengeOpen(v.cyc),
    dir: v.paths.cycle,
  };
  if (asJson) emitJson(payload, 0);
  console.log(ui.header(`ORC · challenge ${slug} — ${plural(iters.length, "iteration")}`));
  for (const it of iters) {
    console.log(`\n  iteration ${it.n}  ${it.passed ? "PASS" : "FAIL"}   coverage ${it.coverage_pct}%   graded against template v${it.graded_against} · goal v${it.graded_against_goal}`);
    for (const f of it.findings || [])
      console.log(
        `    ${String(f.severity).padEnd(3)} ${f.id}  ${f.dimension}  ${f.anchor}` +
          (f.outcome ? `  → ${f.outcome}` : "") +
          `\n        ${ui.color.gray(f.what_is_wrong || "")}`
      );
  }
  process.exit(0);
}

// ── orc challenge diff ──────────────────────────────────────────────────────
// Per-finding freshness is COVERAGE-RELATIVE — the computeWikiFreshness lesson
// applied to findings: did the lines THIS finding anchors actually change?
//
// It is a HINT FOR THE HUMAN AND NEVER AN INPUT TO THE JUDGE. Untouched does not
// mean unfixed (the fix may be elsewhere) and touched does not mean fixed. Rule
// 11: the judge re-reads the artifact from disk, every time.
// +/− for one path, tracked or not. An untracked file is reported as wholly
// added, which is what it is — `git diff` reports it as nothing at all.
function challengeGitStat(root, rel) {
  const tracked = gitIn(root, ["ls-files", "--error-unmatch", "--", rel]);
  if (tracked === null || !String(tracked).trim()) {
    let n = 0;
    try {
      n = fs.readFileSync(path.join(root, rel), "utf8").split("\n").length;
    } catch (_) {}
    return { added: n, removed: 0, untracked: true };
  }
  const nm = String(gitIn(root, ["diff", "--numstat", "HEAD", "--", rel]) || "").trim().split(/\s+/);
  return { added: Number(nm[0]) || 0, removed: Number(nm[1]) || 0, untracked: false };
}

function challengeDiff(claudeDir, slugArg) {
  const asJson = wantsJson();
  const cfg = resolvedConfig(claudeDir);
  const slug = chSlug(slugArg);
  const v = slug ? challengeView(claudeDir, slug, cfg) : null;
  if (!v) {
    if (asJson) emitJson({ ok: false, reason: "no-such-cycle", slug: slugArg || null }, 3);
    console.log(`no challenge cycle "${slugArg || ""}".`);
    process.exit(3);
  }
  const expectedAbs = path.join(v.paths.root, v.expected);
  const found = fs.existsSync(expectedAbs);

  if (!found) {
    // IT LISTS, IT DOES NOT ADOPT. Picking the closest-looking file would be ORC
    // guessing what the user did, and a judge pointed at the wrong file produces
    // a page of confident, useless findings.
    const since = v.last ? v.last.closed_at : null;
    // `git status --porcelain`, not `git diff` — a brand-new `-v2.md` is
    // UNTRACKED, and a diff against HEAD cannot see it. Missing the one file the
    // user actually wrote is the whole failure this branch exists to avoid.
    const raw = gitIn(v.paths.root, ["status", "--porcelain"]) || "";
    const candidates = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^\S+\s+/, "").replace(/^"|"$/g, ""))
      // A directory is never the revision, and the review trail is never the
      // artifact — git collapses an untracked tree to `orc/`, which is why both
      // shapes are excluded rather than just the full path.
      .filter((f) => f && !f.endsWith("/") && !f.startsWith(CHALLENGE_DIR.split("/")[0] + "/") && f !== v.expected)
      .map((f) => ({ path: f, ...challengeGitStat(v.paths.root, f) }))
      .slice(0, 20);
    const payload = {
      ok: true,
      slug,
      state: "MISSING-REVISION",
      expected: v.expected,
      found: false,
      since,
      candidates,
      note: "candidates are LISTED, never adopted — record the real one with `orc challenge expect <slug> --set <path>`",
    };
    if (asJson) emitJson(payload, 2);
    console.log(`\nexpected revision:  ${v.expected}   MISSING\n`);
    if (candidates.length) {
      console.log("Candidates changed since the last iteration (git):");
      candidates.forEach((c, i) => console.log(`  ${i + 1}  ${c.path.padEnd(44)} +${c.added} −${c.removed}`));
      console.log("\nWhich of these is the revision — or is the work not done yet?");
      console.log(`Record it:  orc challenge expect ${slug} --set <path>`);
    } else {
      console.log("Nothing has changed in the working tree yet.");
    }
    process.exit(2);
  }

  const nowSha = shaOfFile(expectedAbs);
  const thenSha = v.last ? (v.last.artifact_shas || {})[v.expected] || (v.cyc.artifacts[0] || {}).sha : (v.cyc.artifacts[0] || {}).sha;
  const changed = !!thenSha && nowSha !== thenSha;
  const stat = challengeGitStat(v.paths.root, v.expected);
  const added = stat.added;
  const removed = stat.removed;

  // Which lines moved, so a carried finding can be marked touched/untouched.
  // An UNTRACKED revision has no hunks and every line of it is new, so every
  // anchor counts as touched — the opposite of what an empty patch would say.
  const moved = new Set();
  if (!stat.untracked) {
    const patch = gitIn(v.paths.root, ["diff", "-U0", "HEAD", "--", v.expected]) || "";
    for (const m of patch.matchAll(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
      const start = Number(m[2]);
      const len = m[3] === undefined ? 1 : Number(m[3]);
      for (let i = start; i < start + Math.max(1, len); i++) moved.add(i);
    }
  }

  const carried = challengeOpen(v.cyc).map((f) => {
    const line = Number(String(f.anchor || "").split(":").pop());
    const touched = stat.untracked
      ? true
      : !Number.isFinite(line)
        ? changed
        : moved.has(line) || moved.has(line - 1) || moved.has(line + 1);
    return { id: f.id, anchor: f.anchor, severity: f.severity, dimension: f.dimension, touched };
  });
  const payload = {
    ok: true,
    slug,
    state: v.state,
    expected: v.expected,
    found: true,
    sha_before: thenSha || null,
    sha_after: nowSha,
    changed,
    added,
    removed,
    carried,
    touched: carried.filter((c) => c.touched).length,
    untouched: carried.filter((c) => !c.touched).map((c) => c.id),
    note: "touched/untouched is a HINT for you, never an input to the judge — the judge always re-reads the artifact",
  };
  if (asJson) emitJson(payload, changed ? 1 : 0);
  console.log(`\nexpected revision:  ${v.expected}   FOUND   (${shortSha(thenSha)} → ${shortSha(nowSha)}, +${added} −${removed})`);
  console.log(
    `carried findings:   ${carried.length}   ·  ${payload.touched} touched  ·  ${payload.untouched.length} untouched` +
      (payload.untouched.length ? `   ← ${payload.untouched.join(" ")}` : "")
  );
  console.log(ui.color.gray("\n  touched/untouched is a hint for you. The judge re-reads the artifact either way."));
  process.exit(changed ? 1 : 0);
}

// ── orc challenge expect ────────────────────────────────────────────────────
// A plan the user cannot deviate from is a plan they will deviate from silently.
// The escape is a RECORDED command, never a guess.
function challengeExpectCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const cfg = resolvedConfig(claudeDir);
  const slug = chSlug(slugArg);
  const cyc = slug ? readCycle(claudeDir, slug) : null;
  if (!cyc) {
    if (asJson) emitJson({ ok: false, reason: "no-such-cycle", slug: slugArg || null }, 3);
    console.log(`no challenge cycle "${slugArg || ""}".`);
    process.exit(3);
  }
  const p = challengePaths(claudeDir, slug);
  const set = chOpt("--set");
  if (set) {
    const norm = set.replace(/\\/g, "/");
    const abs = path.resolve(p.root, norm);
    const refuse = (why) => {
      if (asJson) emitJson({ ok: false, reason: "refused", why }, 2);
      console.error("❌ " + why);
      process.exit(2);
    };
    if (!abs.startsWith(path.resolve(p.root))) refuse("the revision path must be inside this repo.");
    if (abs.startsWith(path.resolve(p.cycle)))
      refuse("the revision may never live under orc/orc-challenge/ — that folder is the review trail, not the artifact.");
    cyc.revision = { ...(cyc.revision || { mode: "in-place" }), expect_override: norm };
    cyc.events.push({ at: fmtStamp(new Date()), kind: "expect", detail: norm });
    writeCycle(claudeDir, slug, cyc);
  }
  const v = challengeView(claudeDir, slug, cfg);
  const abs = path.join(p.root, v.expected);
  if (asJson) emitJson({ ok: true, slug, expected: v.expected, found: fs.existsSync(abs), mode: (cyc.revision || {}).mode || "in-place" }, 0);
  console.log("\n  Where to put the revised version\n");
  console.log(`  Write to:      ${v.expected}        ← this exact path`);
  console.log(`  Do NOT write:  anything under ${CHALLENGE_DIR}${slug}/`);
  console.log(`  Status:        ${fs.existsSync(abs) ? "FOUND" : "not there yet"}`);
  process.exit(0);
}

// ── orc challenge accept / rebut ────────────────────────────────────────────
// Two escape valves, because a loop with no exit is a trap. Neither is ever
// automatic — the /orc-pact retirement rule.
function challengeAccept(claudeDir, slugArg, id, reason) {
  const asJson = wantsJson();
  const slug = chSlug(slugArg);
  const cyc = slug ? readCycle(claudeDir, slug) : null;
  if (!cyc) {
    if (asJson) emitJson({ ok: false, reason: "no-such-cycle" }, 3);
    console.log(`no challenge cycle "${slugArg || ""}".`);
    process.exit(3);
  }
  const known = new Set(cyc.iterations.flatMap((it) => (it.findings || []).map((f) => f.id)));
  if (!id || !known.has(id)) {
    if (asJson) emitJson({ ok: false, reason: "no-such-finding", id: id || null }, 3);
    console.log(`no finding ${id || "(none given)"} in ${slug}.`);
    process.exit(3);
  }
  if (!reason || !String(reason).trim()) {
    if (asJson) emitJson({ ok: false, reason: "no-reason" }, 2);
    console.error('❌ accepting a finding requires a reason: orc challenge accept <slug> <id> "why"');
    process.exit(2);
  }
  cyc.accepted[id] = { reason: String(reason).trim(), at: fmtStamp(new Date()), iteration: cyc.iterations.length };
  cyc.events.push({ at: fmtStamp(new Date()), kind: "accept", detail: `${id} — ${reason}` });
  writeCycle(claudeDir, slug, cyc);
  if (asJson) emitJson({ ok: true, slug, id, accepted: cyc.accepted[id] }, 0);
  console.log(`✓ ${id} accepted as a known gap. It stops blocking, and it stays visible in every report with your reason.`);
  process.exit(0);
}

function challengeRebut(claudeDir, slugArg, id, reason) {
  const asJson = wantsJson();
  const slug = chSlug(slugArg);
  const cyc = slug ? readCycle(claudeDir, slug) : null;
  if (!cyc) {
    if (asJson) emitJson({ ok: false, reason: "no-such-cycle" }, 3);
    console.log(`no challenge cycle "${slugArg || ""}".`);
    process.exit(3);
  }
  const known = new Set(cyc.iterations.flatMap((it) => (it.findings || []).map((f) => f.id)));
  if (!id || !known.has(id)) {
    if (asJson) emitJson({ ok: false, reason: "no-such-finding", id: id || null }, 3);
    console.log(`no finding ${id || "(none given)"} in ${slug}.`);
    process.exit(3);
  }
  if (!reason || !String(reason).trim()) {
    if (asJson) emitJson({ ok: false, reason: "no-reason" }, 2);
    console.error('❌ a rebuttal requires a reason: orc challenge rebut <slug> <id> "why the judge is wrong"');
    process.exit(2);
  }
  cyc.rebuttals[id] = { reason: String(reason).trim(), at: fmtStamp(new Date()), status: "open" };
  cyc.events.push({ at: fmtStamp(new Date()), kind: "rebut", detail: `${id} — ${reason}` });
  writeCycle(claudeDir, slug, cyc);
  if (asJson) emitJson({ ok: true, slug, id, rebuttal: cyc.rebuttals[id] }, 0);
  console.log(
    `✓ ${id} rebutted. The next judgement MUST answer it explicitly — withdrawn (with an admission) or\n` +
      `  upheld (with new evidence). A rebutted finding the next verdict ignores is malformed and is rejected.`
  );
  process.exit(0);
}

// ── orc challenge template / goals (the two frozen artifacts) ───────────────
function challengeRefreeze(claudeDir, slugArg, which) {
  const asJson = wantsJson();
  const slug = chSlug(slugArg);
  const cyc = slug ? readCycle(claudeDir, slug) : null;
  if (!cyc) {
    if (asJson) emitJson({ ok: false, reason: "no-such-cycle" }, 3);
    console.log(`no challenge cycle "${slugArg || ""}".`);
    process.exit(3);
  }
  const p = challengePaths(claudeDir, slug);
  const set = chOpt("--set");
  if (!set) {
    const body = fs.existsSync(which === "goals" ? p.goals : p.template)
      ? fs.readFileSync(which === "goals" ? p.goals : p.template, "utf8")
      : null;
    if (asJson)
      emitJson(
        which === "goals"
          ? { ok: true, slug, goals: cyc.goals, file: p.goals }
          : { ok: true, slug, template: cyc.template, no_template: !!cyc.no_template, file: cyc.no_template ? null : p.template },
        0
      );
    console.log(body === null ? `(no ${which} file — D1 is NOT-CHECKED with that reason)` : body);
    process.exit(0);
  }
  const reason = chOpt("--reason");
  if (!reason || !String(reason).trim()) {
    if (asJson) emitJson({ ok: false, reason: "no-reason" }, 2);
    console.error(
      `❌ changing the frozen ${which} mid-cycle needs --reason "…". Prior iterations are stamped ` +
        `graded_against${which === "goals" ? "_goal" : ""}: ${which === "goals" ? cyc.goals.version : cyc.template.version}, ` +
        "because a review history against a moving yardstick is not a history."
    );
    process.exit(2);
  }
  const abs = path.isAbsolute(set) ? set : path.join(p.root, set);
  if (!fs.existsSync(abs)) {
    if (asJson) emitJson({ ok: false, reason: "no-such-file", path: set }, 2);
    console.error(`❌ not found: ${set}`);
    process.exit(2);
  }
  const body = fs.readFileSync(abs, "utf8");
  if (which === "goals") {
    fs.writeFileSync(p.goals, body);
    cyc.goals = { ...cyc.goals, frozen: CHALLENGE_GOALS, sha: sha256(body.replace(/\r\n/g, "\n")), version: (cyc.goals.version || 1) + 1, source: set };
    cyc.events.push({ at: fmtStamp(new Date()), kind: "regoal", detail: `${set} — ${reason}`, to_version: cyc.goals.version });
  } else {
    fs.writeFileSync(p.template, body);
    cyc.template = { source: set, frozen: CHALLENGE_TEMPLATE, sha: sha256(body.replace(/\r\n/g, "\n")), version: (cyc.template.version || 1) + 1 };
    cyc.no_template = false;
    cyc.events.push({ at: fmtStamp(new Date()), kind: "retemplate", detail: `${set} — ${reason}`, to_version: cyc.template.version });
  }
  writeCycle(claudeDir, slug, cyc);
  if (asJson) emitJson({ ok: true, slug, which, version: which === "goals" ? cyc.goals.version : cyc.template.version, reason }, 0);
  console.log(
    `✓ ${which} re-frozen at v${which === "goals" ? cyc.goals.version : cyc.template.version}. ` +
      `Prior iterations keep their stamp, and the panel draws the version break.`
  );
  process.exit(0);
}

// ── orc challenge record — THE GATE, not a store ────────────────────────────
// `record` is the skill's ONE write. It rejects a malformed verdict (rule 4,
// rule 6), it DROPS findings with no `serves` (rule 0), and it — not the judge —
// computes PASS (rule 2).
function challengeRecord(claudeDir, slugArg) {
  const asJson = wantsJson();
  const cfg = resolvedConfig(claudeDir);
  const slug = chSlug(slugArg);
  const cyc = slug ? readCycle(claudeDir, slug) : null;
  const bad = (reason, detail, extra) => {
    if (asJson) emitJson({ ok: false, reason, detail, ...(extra || {}) }, 2);
    console.error("❌ malformed verdict — " + detail);
    process.exit(2);
  };
  if (!cyc) {
    if (asJson) emitJson({ ok: false, reason: "no-such-cycle", slug: slugArg || null }, 3);
    console.log(`no challenge cycle "${slugArg || ""}".`);
    process.exit(3);
  }
  const p = challengePaths(claudeDir, slug);
  const from = chOpt("--from");
  if (!from) bad("no-input", "orc challenge record needs --from <verdict.json>.");
  const fromAbs = path.isAbsolute(from) ? from : path.join(p.root, from);
  let input;
  try {
    input = JSON.parse(fs.readFileSync(fromAbs, "utf8"));
  } catch (e) {
    bad("unreadable", `could not read ${from}: ${e.message}`);
  }

  const n = Number(chOpt("--iteration") || input.iteration || cyc.iterations.length + 1);
  if (!Number.isFinite(n) || n < 1) bad("bad-iteration", "--iteration must be a positive integer.");
  if (cyc.iterations.some((it) => it.n === n)) bad("duplicate-iteration", `iteration ${n} is already recorded.`);

  const carriedIn = challengeOpen(cyc);
  const carriedIds = new Set(carriedIn.map((f) => f.id));

  // RULE 0 — a finding that cannot be traced to the stated goal, audience or
  // done_means is out of scope and is DROPPED. This is the mechanism that stops
  // a judge with a large context window from reviewing the entire universe.
  const dropped = [];
  const raw = Array.isArray(input.findings) ? input.findings : [];
  const findings = [];
  for (const f of raw) {
    const serves = String(f.serves || "").trim();
    if (!serves || !CHALLENGE_SERVES.some((s) => serves === s || serves.startsWith(s))) {
      dropped.push({ id: f.id || "(unnamed)", why: "no `serves` — not traceable to a stated goal element" });
      continue;
    }
    if (!CHALLENGE_SEVERITIES.includes(String(f.severity || "").toUpperCase()))
      bad("bad-severity", `finding ${f.id}: severity must be one of ${CHALLENGE_SEVERITIES.join(", ")}.`);
    if (!CHALLENGE_DIMS.includes(String(f.dimension || "").toUpperCase()))
      bad("bad-dimension", `finding ${f.id}: dimension must be one of ${CHALLENGE_DIMS.join(", ")}.`);
    const carried = carriedIds.has(f.id);
    if (carried) {
      if (!CHALLENGE_OUTCOMES.includes(String(f.outcome || "")))
        bad("bad-outcome", `carried finding ${f.id} needs an outcome from: ${CHALLENGE_OUTCOMES.join(", ")}.`, { id: f.id });
      if (f.outcome === "withdrawn" && !String(f.reason || "").trim())
        bad("withdrawn-no-reason", `finding ${f.id} was withdrawn with no reason.`, { id: f.id });
      if (f.outcome === "superseded" && !String(f.superseded_by || "").trim())
        bad("superseded-no-id", `finding ${f.id} was superseded without citing the replacement id.`, { id: f.id });
    } else if (f.outcome !== undefined && f.outcome !== null && f.outcome !== "still-open") {
      bad("unknown-carry-id", `finding ${f.id} carries an outcome but was not open at iteration ${n - 1}.`, { id: f.id });
    }
    findings.push({
      id: f.id,
      dimension: String(f.dimension).toUpperCase(),
      severity: String(f.severity).toUpperCase(),
      anchor: f.anchor || null,
      quote: f.quote || null,
      what_is_wrong: f.what_is_wrong || null,
      consequence: f.consequence || null,
      acceptance_line: f.acceptance_line || null,
      serves,
      carried,
      outcome: carried ? f.outcome : f.outcome === "still-open" ? "still-open" : null,
      reason: f.reason || null,
      superseded_by: f.superseded_by || null,
    });
  }

  // RULE 4 — conservation. Below 100% the verdict is malformed and this rejects
  // it by name. Borrowed from context-combiner: a silently dropped finding is
  // indistinguishable from a fixed one.
  const answered = new Set(findings.filter((f) => f.carried).map((f) => f.id));
  for (const id of Object.keys(cyc.accepted)) answered.add(id);
  const missing = [...carriedIds].filter((id) => !answered.has(id));
  const coverage = carriedIds.size === 0 ? 100 : Math.round(((carriedIds.size - missing.length) / carriedIds.size) * 100);
  if (missing.length)
    bad(
      "coverage",
      `coverage is ${coverage}% — every finding carried in must get exactly ONE outcome. Missing: ${missing.join(", ")}`,
      { coverage_pct: coverage, missing }
    );

  // A rebutted finding the next judge ignores is a malformed return, and the
  // iteration is rejected. Without this, one bad finding loops forever.
  const openRebuttals = Object.entries(cyc.rebuttals).filter(([, r]) => r.status === "open");
  const addressed = new Map((Array.isArray(input.rebuttals_addressed) ? input.rebuttals_addressed : []).map((r) => [r.id, r]));
  const ignored = openRebuttals.filter(([id]) => !addressed.has(id)).map(([id]) => id);
  if (ignored.length)
    bad("rebuttal-ignored", `these rebuttals were not addressed: ${ignored.join(", ")}`, { ignored });
  for (const [id, r] of addressed) {
    if (!["withdrawn", "upheld"].includes(String(r.result)))
      bad("bad-rebuttal-result", `rebuttal ${id}: result must be "withdrawn" or "upheld".`);
    if (!String(r.reason || "").trim()) bad("rebuttal-no-reason", `rebuttal ${id}: a result needs its reason.`);
    if (cyc.rebuttals[id]) cyc.rebuttals[id] = { ...cyc.rebuttals[id], status: r.result, answered_at: fmtStamp(new Date()), answer: r.reason };
  }

  // RULE 6 — a dimension is NEVER silently skipped. Every SELECTED dimension must
  // report, and NOT-CHECKED must carry its reason. Making it structural here is
  // what lets PASS be a pure severity question below.
  const dimsIn = new Map((Array.isArray(input.dimensions) ? input.dimensions : []).map((d) => [String(d.id).toUpperCase(), d]));
  const dimensions = [];
  for (const id of cyc.dimensions) {
    const d = dimsIn.get(id);
    if (!d) bad("dimension-silent", `dimension ${id} is selected but reported nothing. NOT-CHECKED with a reason is allowed; silence is not.`, { dimension: id });
    const status = String(d.status || "").toUpperCase();
    if (!["CHECKED", "NOT-CHECKED"].includes(status))
      bad("dimension-status", `dimension ${id}: status must be CHECKED or NOT-CHECKED.`);
    if (status === "NOT-CHECKED" && !String(d.reason || "").trim())
      bad("dimension-no-reason", `dimension ${id} is NOT-CHECKED with no reason — a silently skipped check is indistinguishable from a forgotten one.`);
    dimensions.push({
      id,
      status,
      findings: Number(d.findings || findings.filter((f) => f.dimension === id && !f.outcome).length),
      ...(d.score ? { score: String(d.score) } : {}),
      ...(d.reason ? { reason: String(d.reason) } : {}),
    });
  }

  const verdictFile = input.verdict_file || `${iterDir(n)}/verdict.md`;
  const verdictAbs = path.join(p.cycle, verdictFile);
  const verdictSha = shaOfFile(verdictAbs);
  if (verdictSha === null) bad("no-verdict-file", `the verdict body is missing: ${verdictFile}`);

  const it = {
    n,
    started_at: input.started_at || fmtStamp(new Date()),
    artifact_shas: {},
    graded_against: cyc.template.version || 1,
    graded_against_goal: cyc.goals.version || 1,
    lint: input.lint || null,
    reader: input.reader || null,
    verdict_file: verdictFile,
    verdict_file_sha: verdictSha,
    advice_file: input.advice_file || null,
    dimensions,
    findings,
    dropped,
    coverage_pct: coverage,
    closed_at: fmtStamp(new Date()),
  };
  for (const a of cyc.artifacts) it.artifact_shas[a.path] = shaOfFile(path.join(p.root, a.path));
  const expected = challengeExpected(cyc);
  if (!it.artifact_shas[expected]) it.artifact_shas[expected] = shaOfFile(path.join(p.root, expected));

  cyc.iterations.push(it);

  // RULE 2 — PASS IS COMPUTED HERE. The judge reports findings; it can never
  // declare a pass, which removes leniency as a possibility: it can only find,
  // or fail to find.
  const blocking = challengeBlocking(cyc, cfg);
  it.blocking = blocking.length;
  it.severities = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of challengeOpen(cyc)) it.severities[f.severity]++;
  it.passed = blocking.length === 0;
  it.advised = !it.passed;

  cyc.events.push({ at: it.closed_at, kind: "iteration", detail: `${n} — ${it.passed ? "PASS" : "FAIL"} (${blocking.length} blocking)` });
  writeCycle(claudeDir, slug, cyc);

  const v = challengeView(claudeDir, slug, cfg);
  const payload = {
    ok: true,
    slug,
    iteration: n,
    passed: it.passed,
    blocking: it.blocking,
    severities: it.severities,
    coverage_pct: coverage,
    dropped,
    dimensions,
    state: v.state,
    stalled: v.stalled,
    advise: !it.passed,
    // The one trace line this iteration owes, assembled here so the skill never
    // composes a second wording for it.
    trace_line: `CHALLENGE iter=${n} findings=P0:${it.severities.P0}/P1:${it.severities.P1}/P2:${it.severities.P2} coverage=${coverage}% verdict=${it.passed ? "PASS" : "FAIL"}`,
    next: it.passed ? `orc challenge report ${slug}` : `write ${CHALLENGE_DIR}${slug}/fix-brief-${String(n).padStart(2, "0")}.md, then STOP`,
  };
  if (asJson) emitJson(payload, 0);
  console.log(`\n  iteration ${n}: ${it.passed ? "PASS" : "FAIL"} — ${plural(it.blocking, "blocking finding")}, coverage ${coverage}%`);
  if (dropped.length) console.log(`  ${plural(dropped.length, "finding")} dropped for having no \`serves\` (out of scope of the stated goal).`);
  console.log(`  ${payload.trace_line}`);
  process.exit(0);
}

// ── orc challenge report — DERIVED prose ────────────────────────────────────
// CHALLENGE.md and the final report are rendered from the ledger plus the verdict
// bodies. Same split as wiki docs (a model) vs wiki/INDEX.md (the CLI): prose
// costs a model, registration is derived.
function challengeReport(claudeDir, slugArg) {
  const asJson = wantsJson();
  const cfg = resolvedConfig(claudeDir);
  const slug = chSlug(slugArg);
  const v = slug ? challengeView(claudeDir, slug, cfg) : null;
  if (!v) {
    if (asJson) emitJson({ ok: false, reason: "no-such-cycle", slug: slugArg || null }, 3);
    console.log(`no challenge cycle "${slugArg || ""}".`);
    process.exit(3);
  }
  const c = v.cyc;
  const L = [
    "<!-- orc-challenge:derived — written by `orc challenge report`. Do NOT hand-edit:",
    `     the source of truth is ${CHALLENGE_DIR}${slug}/${CHALLENGE_LEDGER}. -->`,
    "",
    `# Challenge — ${slug}`,
    "",
    `**State:** ${v.state} — ${v.why}`,
    `**Rendered:** ${fmtStamp(new Date())}`,
    "",
    "## What this artifact has to achieve",
    "",
    `- **Goal (v${c.goals.version}):** ${c.goals.goal}`,
    `- **Audience:** ${c.goals.audience}`,
    `- **Done means:** ${c.goals.done_means}`,
    ...(c.goals.out_of_scope || []).map((s) => `- **Out of scope:** ${s}`),
    ...(c.goals.context_refs || []).map((s) => `- **Context (evidence, not instruction):** ${s}`),
    "",
    "## Artifacts",
    "",
    ...c.artifacts.map((a) => `- \`${a.path}\``),
    "",
    `Revision goes to: \`${v.expected}\` (${(c.revision || {}).mode || "in-place"})`,
    "",
    "## Dimensions",
    "",
    ...v.dimensions.map(
      (d) =>
        `- **${d.id}** — ${d.status}` +
        (d.status === "CHECKED" && d.findings !== undefined ? ` · ${plural(d.findings, "finding")}` : "") +
        (d.score ? ` · ${d.score}` : "") +
        (d.reason ? ` — ${d.reason}` : "")
    ),
    "",
    "## Convergence",
    "",
    "| Iteration | Verdict | Blocking | P0 | P1 | P2 | P3 | Coverage | Template | Goal |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...c.iterations.map(
      (it) =>
        `| ${it.n} | ${it.passed ? "PASS" : "FAIL"} | ${it.blocking || 0} | ${(it.severities || {}).P0 || 0} | ${(it.severities || {}).P1 || 0} | ` +
        `${(it.severities || {}).P2 || 0} | ${(it.severities || {}).P3 || 0} | ${it.coverage_pct}% | v${it.graded_against} | v${it.graded_against_goal} |`
    ),
    "",
  ];
  if (v.stalled)
    L.push(
      `⚠ **stalled** — no net reduction in ${cfg.challenge_stall_after} iterations. Narrow the rubric, accept the gaps, or keep going.`,
      ""
    );
  const open = challengeOpen(c);
  if (open.length) {
    L.push("## Open findings", "");
    for (const f of open)
      L.push(
        `### ${f.id} · ${f.severity} · ${f.dimension} — ${f.anchor || "(no anchor)"}`,
        "",
        f.what_is_wrong ? `${f.what_is_wrong}` : "",
        f.consequence ? `- **Consequence:** ${f.consequence}` : "",
        f.acceptance_line ? `- **Fixed when:** ${f.acceptance_line}` : "",
        `- **Serves:** ${f.serves}`,
        ""
      );
  }
  const acc = Object.entries(c.accepted);
  if (acc.length) {
    L.push("## Accepted exceptions", "", "Accepted as known gaps. They stopped blocking; they never stopped being true.", "");
    for (const [id, a] of acc) L.push(`- **${id}** — ${a.reason}  _(${a.at})_`);
    L.push("");
  }
  const reb = Object.entries(c.rebuttals);
  if (reb.length) {
    L.push("## Rebuttals", "");
    for (const [id, r] of reb) L.push(`- **${id}** — ${r.reason} → **${r.status}**${r.answer ? " — " + r.answer : ""}`);
    L.push("");
  }
  if (c.events.length) {
    L.push("## Events", "");
    for (const e of c.events) L.push(`- \`${e.at}\` **${e.kind}** — ${e.detail}`);
    L.push("");
  }
  L.push(
    "---",
    "",
    "These files are **not staged**. Commit them if your team should see the review trail.",
    ""
  );
  // Keep the blank lines — markdown needs them — but drop the `undefined`/false
  // rows the optional fields above produce, and collapse any run of three.
  const body = L.filter((l) => typeof l === "string").join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  fs.mkdirSync(v.paths.cycle, { recursive: true });
  fs.writeFileSync(v.paths.doc, body);

  let final = null;
  if (v.state === "PASSED") {
    const d = new Date();
    final = path.join(
      v.paths.cycle,
      `final-report-${two(d.getDate())}${two(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.md`
    );
    fs.writeFileSync(final, body.replace(`# Challenge — ${slug}`, `# Challenge — ${slug} — PASSED`));
  }
  if (asJson) emitJson({ ok: true, slug, doc: v.paths.doc, final_report: final, state: v.state }, 0);
  console.log(`✓ ${CHALLENGE_DOC} rendered from the ledger — ${plural(c.iterations.length, "iteration")}.\n  ${v.paths.doc}`);
  if (final) console.log(`✓ final report: ${final}`);
  console.log(`  Not staged. Commit them if your team should see the review trail:  git add ${CHALLENGE_DIR}${slug}/`);
  process.exit(0);
}

// ── orc challenge outline / lint — the deterministic engine ─────────────────
//
// TWO HONESTY RULES, stated in references/plain-english.md and printed by the
// command itself:
//   1. It is a SIGNAL, not a verdict (the /orc-aftermath rule). A long sentence
//      is not automatically a defect. The lint NEVER blocks; it feeds the judge,
//      who decides.
//   2. It is English-specific and heuristic. Grade formulas are estimates and
//      passive-voice detection is a pattern match. Say so, once, on the output.
//
// Its real payoff: lint.json rides in the judge's slice, so the judge never
// spends tokens counting sentences — it spends them on D2, the only dimension
// no computer can reach.

// The curated lists. references/plain-english.md carries the same words as
// documented drift the token lint cannot see (a word list is not a token).
const LINT_IDIOMS = [
  "spin up", "spun up", "roll out", "rolled out", "kick off", "kicked off", "go-live",
  "reach out", "circle back", "touch base", "move the needle", "low-hanging fruit",
  "boil the ocean", "ramp up", "wind down", "drill down", "hash out", "iron out",
  "flesh out", "in the weeds", "on the same page", "at the end of the day",
  "bake in", "baked in", "double down", "take a stab", "ballpark", "off the shelf",
];
const LINT_MARKERS = ["TBD", "TODO", "???", "tbc", "as needed", "and so on", "etc.", "FIXME", "N/A?"];
const LINT_VAGUE = [
  "some", "several", "appropriate", "reasonable", "quickly", "efficient", "efficiently",
  "properly", "adequate", "sufficient", "various", "a number of", "as required",
  "if necessary", "where applicable", "robust", "scalable", "seamless",
];
// Acronyms every reader of a technical doc already has. Everything else must be
// expanded on first use — that is a D5 finding, not a style opinion.
const LINT_COMMON_ACRONYMS = new Set([
  "API", "HTTP", "HTTPS", "JSON", "YAML", "XML", "URL", "URI", "ID", "IDS", "UI", "UX",
  "CPU", "RAM", "SQL", "CSV", "PDF", "HTML", "CSS", "CI", "CD", "PR", "MR", "OK", "AWS",
  "GCP", "SDK", "CLI", "IDE", "OS", "TLS", "SSL", "DNS", "TCP", "UDP", "REST", "CRUD",
  "UUID", "README", "MD", "GB", "MB", "KB", "MS", "TBD", "TODO", "FAQ", "ADR", "PRD",
  "TSD", "SLA", "SLO", "QA", "AI", "ML", "LLM", "ORC", "A", "I", "AND", "OR", "THE",
]);
const LINT_SENTENCE_MAX = 25;
const LINT_PASSIVE_MAX_PCT = 25;
const LINT_EMPTY_SECTION_WORDS = 15;

const PASSIVE_RE = /\b(is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+(?:ed|en))\b/gi;
const SYLL_RE = /[aeiouy]+/g;

function syllables(word) {
  const w = String(word).toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const m = w.replace(/e$/, "").match(SYLL_RE);
  return Math.max(1, m ? m.length : 1);
}

// Strip everything a prose metric must not read: fenced code, inline code,
// tables, link targets, HTML comments. Counting a URL as a long sentence is how
// a lint loses a reader's trust in one line of output.
function proseLines(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let fence = false;
  let comment = false;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (/^\s*```/.test(l)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (/<!--/.test(l)) comment = true;
    if (comment) {
      if (/-->/.test(l)) comment = false;
      continue;
    }
    if (/^\s*\|/.test(l)) continue;
    if (/^\s{4,}\S/.test(l)) continue;
    l = l
      .replace(/`[^`]*`/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/g, " ");
    out.push({ n: i + 1, text: l });
  }
  return out;
}

function headingTree(text) {
  const out = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) out.push({ line: i + 1, depth: m[1].length, title: m[2].replace(/[*_`]/g, "").trim() });
  }
  return out;
}

const normHead = (s) =>
  String(s)
    .toLowerCase()
    .replace(/^\d+[.)]?\s*/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function challengeOutline(pathArg) {
  const asJson = wantsJson();
  if (!pathArg || !fs.existsSync(pathArg)) {
    if (asJson) emitJson({ ok: false, reason: "unreadable", path: pathArg || null }, 2);
    console.error(`❌ cannot read: ${pathArg || "(no path given)"}`);
    process.exit(2);
  }
  const text = fs.readFileSync(pathArg, "utf8");
  const tree = headingTree(text);
  if (asJson) emitJson({ ok: true, path: pathArg, headings: tree }, 0);
  console.log(ui.header(`outline — ${pathArg}`));
  for (const h of tree) console.log(`  ${String(h.line).padStart(5)}  ${"  ".repeat(h.depth - 1)}${h.title}`);
  process.exit(0);
}

function challengeLint(pathArg, templateArg) {
  const asJson = wantsJson();
  if (!pathArg || !fs.existsSync(pathArg) || fs.statSync(pathArg).isDirectory()) {
    if (asJson) emitJson({ ok: false, reason: "unreadable", path: pathArg || null }, 2);
    console.error(`❌ cannot read: ${pathArg || "(no path given)"}`);
    process.exit(2);
  }
  const text = fs.readFileSync(pathArg, "utf8");
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const findings = [];
  let seq = 0;
  const add = (dimension, line, what, quote) =>
    findings.push({
      id: "L-" + String(++seq).padStart(3, "0"),
      dimension,
      line,
      what,
      quote: quote ? String(quote).slice(0, 160) : null,
    });

  // ── structure (needs a template) ──────────────────────────────────────────
  const tree = headingTree(text);
  let structure = null;
  if (templateArg && fs.existsSync(templateArg)) {
    // Depth 2–3 only. The H1 is the document's TITLE, and a title that differs
    // from the template's is the document being about something — not a missing
    // section and not an invented one.
    const secOf = (t) => headingTree(t).filter((h) => h.depth >= 2 && h.depth <= 3);
    const tTree = secOf(fs.readFileSync(templateArg, "utf8"));
    const have = secOf(text).map((h) => normHead(h.title));
    const required = tTree.map((h) => normHead(h.title));
    const missingSections = required.filter((r) => r && !have.includes(r));
    for (const m of missingSections) add("D1", 1, `required section missing: "${m}"`, null);

    // out of order: the required sections that DO appear, compared pairwise
    const present = required.filter((r) => have.includes(r));
    const order = present.map((r) => have.indexOf(r));
    const outOfOrder = order.some((x, i) => i > 0 && x < order[i - 1]);
    if (outOfOrder) add("D1", 1, "required sections appear out of the template's order", null);

    const invented = tree.filter((h) => h.depth >= 2 && h.depth <= 3 && !required.includes(normHead(h.title)));
    for (const h of invented) add("D1", h.line, `section not in the template: "${h.title}"`, h.title);
    structure = {
      required: required.length,
      present: present.length,
      missing: missingSections,
      out_of_order: outOfOrder,
      invented: invented.map((h) => h.title),
    };
  }

  // Empty ceremony — a heading with almost no body under it. A CONTAINER (its
  // next heading is deeper) is skipped: its children carry the body, and
  // flagging it would fire on the title of every well-structured document.
  for (let i = 0; i < tree.length; i++) {
    const next = tree[i + 1];
    if (next && next.depth > tree[i].depth) continue;
    const from = tree[i].line;
    const to = next ? next.line : lines.length + 1;
    const words = lines
      .slice(from, to - 1)
      .join(" ")
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    if (words < LINT_EMPTY_SECTION_WORDS)
      add("D1", tree[i].line, `section "${tree[i].title}" has ${plural(words, "word")} of body — ceremony, not content`, tree[i].title);
  }

  // table column consistency + code fences with no language tag
  let cols = null;
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const f = l.match(/^\s*```(\S*)/);
    if (f) {
      if (!fence && !f[1]) add("D1", i + 1, "code fence has no language tag", l.trim());
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (/^\s*\|/.test(l)) {
      const n = l.split("|").length;
      if (cols === null) cols = n;
      else if (n !== cols) {
        add("D3", i + 1, `table row has ${n - 1} cells where the table opened with ${cols - 1}`, l.trim());
        cols = n;
      }
    } else cols = null;
  }

  // relative links and file:line anchors that do not resolve on disk
  const base = path.dirname(path.resolve(pathArg));
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/\[[^\]]*\]\(([^)#\s]+)[^)]*\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      if (!fs.existsSync(path.resolve(base, target))) add("D3", i + 1, `link target does not resolve: ${target}`, lines[i].trim());
    }
    for (const m of lines[i].matchAll(/`([\w./-]+\.[a-z]{1,5}):(\d+)`/g))
      if (!fs.existsSync(path.resolve(base, m[1]))) add("D3", i + 1, `anchor points at a file that is not there: ${m[1]}`, lines[i].trim());
  }

  // ── prose (no template needed) ────────────────────────────────────────────
  const prose = proseLines(text);
  const body = prose.map((p) => p.text).join("\n");

  // acronym used before it is defined
  const defined = new Set();
  for (const m of body.matchAll(/\(([A-Z]{2,6})\)/g)) defined.add(m[1]);
  for (const m of body.matchAll(/\b([A-Z]{2,6})\b\s*\(([^)]{4,})\)/g)) defined.add(m[1]);
  const seenAcr = new Set();
  for (const p of prose)
    for (const m of p.text.matchAll(/\b([A-Z]{2,6})\b/g)) {
      const a = m[1];
      if (LINT_COMMON_ACRONYMS.has(a) || defined.has(a) || seenAcr.has(a)) continue;
      seenAcr.add(a);
      add("D5", p.n, `"${a}" is used before it is defined`, p.text.trim());
    }

  // sentence length, passive voice, reading grade
  // Sentences are measured over PARAGRAPHS, not over lines. A hard-wrapped
  // 39-word sentence is still a 39-word sentence; splitting at the newline is
  // how a length check silently passes every wrapped document.
  const sentences = [];
  let para = null;
  const flush = () => {
    if (!para) return;
    for (const s of para.text.split(/(?<=[.!?])\s+/)) {
      const words = s.trim().split(/\s+/).filter(Boolean);
      if (words.length < 3) continue;
      sentences.push({ n: para.n, text: s.trim(), words: words.length });
    }
    para = null;
  };
  for (const p of prose) {
    const clean = p.text.replace(/^\s*[-*+>]\s+/, "").replace(/^#+\s+/, "").trim();
    // A blank line, a heading or a new list item starts a new block.
    if (!clean || /^#+\s/.test(p.text) || /^\s*[-*+>]\s+/.test(p.text)) flush();
    if (!clean) continue;
    if (!para) para = { n: p.n, text: clean };
    else para.text += " " + clean;
    if (/^#+\s/.test(p.text)) flush();
  }
  flush();
  sentences.sort((a, b) => a.n - b.n);
  for (const s of sentences)
    if (s.words > LINT_SENTENCE_MAX) add("D5", s.n, `sentence is ${s.words} words (over ${LINT_SENTENCE_MAX})`, s.text);
  const lens = sentences.map((s) => s.words).sort((a, b) => a - b);
  const at = (q) => (lens.length ? lens[Math.min(lens.length - 1, Math.floor(q * lens.length))] : 0);

  let passiveHits = 0;
  for (const s of sentences) if (PASSIVE_RE.test(s.text)) passiveHits++;
  PASSIVE_RE.lastIndex = 0;
  const passivePct = sentences.length ? Math.round((passiveHits / sentences.length) * 100) : 0;
  if (passivePct > LINT_PASSIVE_MAX_PCT)
    add("D5", 1, `${passivePct}% of sentences look passive (heuristic; threshold ${LINT_PASSIVE_MAX_PCT}%)`, null);

  const totalWords = sentences.reduce((n, s) => n + s.words, 0);
  const totalSyll = sentences.reduce((n, s) => n + s.text.split(/\s+/).reduce((k, w) => k + syllables(w), 0), 0);
  const fk =
    sentences.length && totalWords
      ? Math.round((0.39 * (totalWords / sentences.length) + 11.8 * (totalSyll / totalWords) - 15.59) * 10) / 10
      : 0;

  // idioms, markers, vague quantifiers, bare pronoun openers
  const lower = (s) => s.toLowerCase();
  for (const p of prose) {
    const lt = lower(p.text);
    for (const idiom of LINT_IDIOMS)
      if (lt.includes(idiom)) add("D5", p.n, `idiom / phrasal verb: "${idiom}" — hard for a non-native reader`, p.text.trim());
    for (const marker of LINT_MARKERS)
      if (lt.includes(lower(marker))) add("D6", p.n, `placeholder marker: "${marker}"`, p.text.trim());
    for (const vague of LINT_VAGUE)
      if (new RegExp("\\b" + vague.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(p.text))
        add("D6", p.n, `ambiguous quantifier: "${vague}" — an implementer cannot build from it`, p.text.trim());
    if (/^\s*(This|It|They|These|Those)\s+(is|are|was|were|will|can|should|must|does|do|has|have)\b/.test(p.text))
      add("D3", p.n, "sentence opens with a bare pronoun — the referent is ambiguous", p.text.trim());
  }

  findings.sort((a, b) => a.line - b.line);
  findings.forEach((f, i) => (f.id = "L-" + String(i + 1).padStart(3, "0")));

  const byDim = {};
  for (const f of findings) byDim[f.dimension] = (byDim[f.dimension] || 0) + 1;
  const payload = {
    ok: true,
    path: pathArg,
    template: templateArg || null,
    findings,
    counts: { total: findings.length, by_dimension: byDim },
    metrics: {
      headings: tree.length,
      sentences: sentences.length,
      words: totalWords,
      sentence_p50: at(0.5),
      sentence_p90: at(0.9),
      passive_pct: passivePct,
      flesch_kincaid_grade: fk,
    },
    structure,
    honesty: [
      "This is a SIGNAL, not a verdict. A long sentence is not automatically a defect — the lint never blocks; it feeds the judge, who decides.",
      "It is English-specific and heuristic: the grade is an estimate and passive-voice detection is a pattern match.",
    ],
  };
  if (asJson) emitJson(payload, findings.length ? 1 : 0);
  console.log(ui.header(`orc challenge lint — ${path.basename(pathArg)}`));
  console.log(
    `\n  ${plural(findings.length, "finding")} · ${sentences.length} sentences · p50 ${at(0.5)}w / p90 ${at(0.9)}w · ` +
      `passive ${passivePct}% · grade ${fk}`
  );
  if (structure)
    console.log(
      `  template: ${structure.present}/${structure.required} required sections present` +
        (structure.missing.length ? `, missing ${structure.missing.length}` : "") +
        (structure.out_of_order ? ", OUT OF ORDER" : "") +
        (structure.invented.length ? `, ${structure.invented.length} not in the template` : "")
    );
  else console.log("  no template given — D1 structure checks did not run.");
  console.log("");
  for (const f of findings.slice(0, 60))
    console.log(`  ${f.id}  ${f.dimension}  ${String(f.line).padStart(5)}  ${f.what}`);
  if (findings.length > 60) console.log(`  … and ${findings.length - 60} more (use --json for all of them)`);
  console.log(ui.color.gray("\n  " + payload.honesty[0] + "\n  " + payload.honesty[1]));
  process.exit(findings.length ? 1 : 0);
}

function challenge() {
  if (flag("--global")) {
    console.error("❌ orc challenge is project-scoped — the review trail is this repo's. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = chPositionals(); // ["challenge", <sub?>, <slug|path?>, <id?>, <reason?>]
  switch (pos[1]) {
    case undefined:
    case "list":
      challengeList(claudeDir);
      break;
    case "status":
      challengeStatus(claudeDir, pos[2]);
      break;
    case "show":
      challengeShow(claudeDir, pos[2]);
      break;
    case "diff":
      challengeDiff(claudeDir, pos[2]);
      break;
    case "expect":
      challengeExpectCmd(claudeDir, pos[2]);
      break;
    case "init":
      challengeInit(claudeDir);
      break;
    case "record":
      challengeRecord(claudeDir, pos[2]);
      break;
    case "accept":
      challengeAccept(claudeDir, pos[2], pos[3], pos.slice(4).join(" ") || chOpt("--reason"));
      break;
    case "rebut":
      challengeRebut(claudeDir, pos[2], pos[3], pos.slice(4).join(" ") || chOpt("--reason"));
      break;
    case "template":
      challengeRefreeze(claudeDir, pos[2], "template");
      break;
    case "goals":
      challengeRefreeze(claudeDir, pos[2], "goals");
      break;
    case "report":
      challengeReport(claudeDir, pos[2]);
      break;
    case "lint":
      challengeLint(pos[2], chOpt("--template"));
      break;
    case "outline":
      challengeOutline(pos[2]);
      break;
    default:
      console.error(
        `Unknown: orc challenge ${pos[1]}\n` +
          "Usage: orc challenge list [--json]                 every cycle + computed state (0 all passed / 1 in-flight / 3 none)\n" +
          "       orc challenge status <slug> [--json]        one cycle (0 passed / 1 blocking / 2 a P0 / 3 unknown)\n" +
          "       orc challenge show <slug> [--iteration N]   full detail incl. findings\n" +
          "       orc challenge diff <slug>                   expected revision, then per-finding touched/untouched\n" +
          "       orc challenge expect <slug> [--set <path>]  where the next revision is expected\n" +
          "       orc challenge lint <path> [--template <p>]  deterministic prose+structure lint, ZERO tokens\n" +
          "       orc challenge outline <path>                the heading tree\n" +
          "       orc challenge record <slug> --iteration N --from <json>\n" +
          '       orc challenge accept|rebut <slug> <id> "reason"\n' +
          "       orc challenge template|goals <slug> [--set <path> --reason \"…\"]\n" +
          "       orc challenge report <slug>                 re-derive CHALLENGE.md\n" +
          "       orc challenge init <slug> --artifact <p> --goal … --audience … --done-means … (--template <p> | --no-template)"
      );
      process.exit(1);
  }
}

// ── /orc-doc (v0.48.0) — the lane that writes the long document ─────────────
//
// THE ONE CONTRACT THIS HALF EXISTS TO ENFORCE: the orchestrator never reads the
// document body. It knows the document only through the derived section map and
// through what the agents it dispatched reported back.
//
// Line arithmetic is the one job a language model is guaranteed to get wrong,
// and the entire token saving depends on the line numbers being right. So the
// map is computed HERE and by nothing else, re-derived after every write, and
// NEVER stored — the same rule that governs computeWikiFreshness and the Flow
// stepper. A stored line number is a wrong line number one edit later.
//
// What this half owns, and a skill that recomputes one of these has forked it:
//   · the section map + its absolute line numbers
//   · the per-section hashes, and the drift/`user-edited` state derived from them
//   · the batching (never split a section, ≤ doc_max_parallel, ≤ the line budget)
//   · the lint findings and the readability signals
//   · the completion state and every exit code
// The skill owns the prose: context.md, RESUME.md, changelog.md, the questions.

const DOC_STATE_FILE = "doc.json";
const DOC_FILE = "document.md";
const DOC_OUTLINE_FILE = "outline.md";
const DOC_WORK = ".work";
// ── v0.49.0 — `sections/` is the source of truth, `document.md` is a BUILD
// ARTIFACT. Before this, every later change was extract (copy a section OUT of
// the monolith) → edit → splice (write it back IN), so the section files existed
// and were dead, and a resumed session routed through the 10,000-line file.
const DOC_SECTIONS = "sections";
const DOC_FRONT_FILE = "00-front.md";
const DOC_HEAD_FILE = "00-head.md";
const DOC_GAPS_FILE = "gaps.md";
const DOC_STATE_VERSION = 2;
// The section states. Mirrored in references/chunking.md — documented drift the
// token lint cannot see (a word list is not a single token), so a golden test
// compares the two.
// `unconfirmed` (v0.49.0): a part file is on disk but no validated return ever
// recorded its hash. A writer killed by a usage limit leaves exactly that, and a
// half-written section must never silently become the deliverable.
const DOC_STATES = ["planned", "written", "checked", "user-edited", "open", "unconfirmed"];
const DOC_ROLES = ["write", "check", "edit"];
const DOC_LENGTHS = ["short", "standard", "thorough"];
const DOC_WRITE_MODES = ["ask", "partial", "all"];
// The hard cap is 2 and a larger value is CLAMPED, never honoured: parallel
// writers on one document is chances for the outline to drift, and the compile
// is what has to reconcile them. v0.49.0 lowered it from 4.
const DOC_MAX_PARALLEL_CAP = 2;

// ORC's OWN bookkeeping markers, defined ONCE and used by lint + compile +
// audit. The set is EXACT and narrow on purpose: a user's own prose beginning
// "Note:" is content and is never flagged. A narrow rule that is always right
// beats a broad one that argues with the author.
//
// A bare `<!-- … -->` is deliberately NOT in here: `html-comment` already
// reports it as an error, and one line must never collect two findings for the
// same fact. `<!-- orc-doc:… -->` and an `orc-doc:` fence ARE ours, so they are.
const DOC_ANNOTATION_RE = /^\s*(?:>\s*\*\*(?:Open|Assumption|Note \(ORC\)):|<!--\s*orc-doc:|(?:```|~~~)\s*orc-doc:)/;

const DOC_VALUE_FLAGS = [
  "--type", "--template", "--title", "--language", "--target", "--length",
  "--role", "--section", "--set", "--dir", "--budget", "--limit",
  "--only", "--confirm",
];

function docPositionals() {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--global") continue;
    if (DOC_VALUE_FLAGS.includes(a)) {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    out.push(a);
  }
  return out;
}

function docOpt(name) {
  for (let i = 0; i < args.length; i++)
    if (args[i] === name && args[i + 1] !== undefined && !String(args[i + 1]).startsWith("--"))
      return String(args[i + 1]);
  return undefined;
}

const docSlugify = (raw) =>
  String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const docStamp = () => {
  const d = new Date();
  return `${two(d.getDate())}${two(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}`;
};

// ── where a Markdown file can actually go (§1.1) ────────────────────────────
// This table is not decoration — it is LOAD-BEARING. `orc doc lint --target`
// enforces the real limit of the place the document is going, and a lint rule
// that came from a real product limit is worth ten invented ones.
const DOC_TARGETS = [
  {
    id: "generic", label: "Generic Markdown", imports: "yes",
    how: "the intersection of every target below — the safe default",
    watch: "nothing target-specific; the strictest rule of each target applies",
    max_heading: 3, front_matter: "ban",
  },
  {
    id: "notion", label: "Notion", imports: "native",
    how: "Settings ▸ Import ▸ Text & Markdown; a ZIP of a folder preserves structure",
    watch: "only H1-H3 exist — H4+ degrades to bold text. 5 MB/file free, 50 MB paid, 5 GB/ZIP. A hidden file in the ZIP fails the import",
    max_heading: 3, front_matter: "ban",
  },
  {
    id: "obsidian", label: "Obsidian", imports: "native",
    how: "drop the file or the folder into the vault",
    watch: "nothing — this is its native storage format",
    max_heading: 6, front_matter: "allow",
  },
  {
    id: "gdocs", label: "Google Docs", imports: "native",
    how: "File ▸ Open an .md, or upload to Drive and open with Docs. Import/export is on by default",
    watch: "tables convert, but complex ones flatten",
    max_heading: 6, front_matter: "ban",
  },
  {
    id: "coda", label: "Coda", imports: "native",
    how: "type /import on the canvas and pick Markdown (or /markdown); multi-file is supported",
    watch: "nothing notable",
    max_heading: 6, front_matter: "ban",
  },
  {
    id: "craft", label: "Craft", imports: "yes",
    how: "import an Obsidian/Markdown folder; it converts files to documents with backlinks and attachments",
    watch: "nothing notable",
    max_heading: 6, front_matter: "ban",
  },
  {
    id: "applenotes", label: "Apple Notes", imports: "native",
    how: "import the .md; it converts the syntax to rich text on the way in",
    watch: "macOS Tahoe / iOS 26 and newer only — older versions have no support at all",
    max_heading: 6, front_matter: "ban",
  },
  {
    id: "github", label: "GitHub / GitLab", imports: "native",
    how: "it IS the format — commit the file",
    watch: "a relative image path must exist in the repository",
    max_heading: 6, front_matter: "ban",
  },
  {
    id: "docusaurus", label: "Docusaurus", imports: "yes",
    how: "drop it into the content tree",
    watch: "this one WANTS YAML front matter — the only case where the default flips",
    max_heading: 6, front_matter: "require",
  },
  {
    id: "hugo", label: "Hugo", imports: "yes",
    how: "drop it into content/",
    watch: "wants YAML front matter (title, date)",
    max_heading: 6, front_matter: "require",
  },
  {
    id: "jekyll", label: "Jekyll", imports: "yes",
    how: "drop it into _posts/ or a collection",
    watch: "wants YAML front matter, and will not render the page without it",
    max_heading: 6, front_matter: "require",
  },
  {
    id: "confluence", label: "Confluence", imports: "app-required",
    how: "a marketplace app (Markdown Importer & Editor, Markdown Importer for Confluence) or a converter script",
    watch: "no native file import. Plan for an admin-installed app — this is the one mainstream target that costs a step",
    max_heading: 6, front_matter: "ban",
  },
  {
    id: "onenote", label: "Microsoft OneNote", imports: "no",
    how: "convert to Word or PDF first, then import that",
    watch: "zero native support on every platform. SharePoint/OneDrive rendering an .md FILE is not the same as a OneNote page",
    max_heading: 6, front_matter: "ban",
  },
];
const docTarget = (id) => DOC_TARGETS.find((t) => t.id === String(id || "generic")) || DOC_TARGETS[0];

// ── the five base templates (§2) ────────────────────────────────────────────
// GOLDEN: every shipped references/templates/<type>.md must carry exactly these
// H2 headings, in this order. A test compares the two, because a template whose
// skeleton disagrees with the batching table produces a plan for a document
// nobody is writing.
//
// `affinity` keeps sections that reference each other in the SAME agent where
// the budget allows — cross-agent consistency is expensive to check and free to
// prevent. `required: false` sections may be dropped at the outline gate;
// a required section with no material becomes a visible `> **Open:**` line.
const DOC_TEMPLATES = [
  {
    type: "prd",
    label: "PRD — Product Requirements Document",
    about: "cover → problem → goals → requirements → risks → rollout, the shape every current template converges on",
    sections: [
      { heading: "Document info", required: true, budget: 20, affinity: "meta", purpose: "title, owner, status, version, date, reviewers — as a table" },
      { heading: "Summary", required: true, budget: 30, affinity: "frame", purpose: "what we are building, in three sentences" },
      { heading: "Problem and context", required: true, budget: 90, affinity: "frame", purpose: "who hurts, and what the evidence is" },
      { heading: "Goals and success metrics", required: true, budget: 80, affinity: "goals", purpose: "each metric with a baseline and a target" },
      { heading: "Non-goals", required: true, budget: 40, affinity: "goals", purpose: "what this deliberately does not do" },
      { heading: "Users and jobs to be done", required: true, budget: 70, affinity: "users", purpose: "who they are and what they are trying to get done" },
      { heading: "Scenarios and user stories", required: true, budget: 110, affinity: "users", purpose: "the concrete paths through the product" },
      { heading: "Functional requirements", required: true, budget: 220, affinity: "req", purpose: "numbered FR-1…, each with a priority" },
      { heading: "Non-functional requirements", required: true, budget: 120, affinity: "req", purpose: "performance, security, privacy, accessibility, i18n, compliance" },
      { heading: "Experience and flows", required: false, budget: 90, affinity: "ux", purpose: "links to designs, described in words for readers who cannot open them" },
      { heading: "Dependencies and assumptions", required: true, budget: 60, affinity: "risk", purpose: "what has to be true, and who else is involved" },
      { heading: "Risks and open questions", required: true, budget: 80, affinity: "risk", purpose: "each with an owner" },
      { heading: "Rollout and measurement plan", required: true, budget: 80, affinity: "ship", purpose: "how it reaches users and how we know it worked" },
      { heading: "Milestones", required: true, budget: 40, affinity: "ship", purpose: "a table: milestone, due, status" },
      { heading: "Out of scope for this release", required: true, budget: 40, affinity: "ship", purpose: "explicitly deferred, so nobody re-litigates it" },
      { heading: "Glossary", required: false, budget: 40, affinity: "back", purpose: "every term the audience would not already know" },
      { heading: "Revision history", required: true, budget: 20, affinity: "back", purpose: "a table: version, date, author, what changed" },
    ],
  },
  {
    type: "tsd",
    label: "TSD — Technical Specification / Design Document",
    about: "the durable design-doc structure whose whole point is that the document exists to write down the trade-offs",
    sections: [
      { heading: "Document info", required: true, budget: 20, affinity: "meta", purpose: "title, author, status, reviewers, date" },
      { heading: "Context and scope", required: true, budget: 90, affinity: "frame", purpose: "the landscape this is being built into" },
      { heading: "Goals and non-goals", required: true, budget: 60, affinity: "frame", purpose: "both halves; the non-goals are what stop the scope moving" },
      { heading: "Overview of the design", required: true, budget: 90, affinity: "design", purpose: "the whole thing in one page, before any detail" },
      { heading: "Detailed design", required: true, budget: 300, affinity: "design", purpose: "H3 subsections: architecture, data model, interfaces, key flows, failure handling" },
      { heading: "Alternatives considered", required: true, budget: 120, affinity: "design", purpose: "one subsection each: the option, the trade-off, why not. MANDATORY — this is why the document exists" },
      { heading: "Cross-cutting concerns", required: true, budget: 110, affinity: "ops", purpose: "security, privacy, observability, cost, compliance" },
      { heading: "Migration, rollout and backout", required: true, budget: 90, affinity: "ops", purpose: "including how to undo it" },
      { heading: "Testing strategy", required: true, budget: 70, affinity: "ops", purpose: "what proves this works, at which level" },
      { heading: "Operational readiness", required: true, budget: 70, affinity: "ops", purpose: "SLOs, alerts, and the runbook this points at" },
      { heading: "Open questions", required: true, budget: 40, affinity: "back", purpose: "each with an owner and a date it must be answered by" },
      { heading: "Timeline and milestones", required: false, budget: 40, affinity: "back", purpose: "a table" },
      { heading: "Revision history", required: true, budget: 20, affinity: "back", purpose: "a table: version, date, author, what changed" },
    ],
  },
  {
    type: "collaboration",
    label: "Collaboration — cross-team working agreement",
    about: "two or more teams agreeing who owns what and how they will talk; RACI is the spine",
    sections: [
      { heading: "Document info", required: true, budget: 20, affinity: "meta", purpose: "owner, version, date, the teams it binds" },
      { heading: "Purpose and scope", required: true, budget: 60, affinity: "frame", purpose: "what this agreement covers, and what it does not" },
      { heading: "Parties", required: true, budget: 60, affinity: "frame", purpose: "a table: team, what they bring, named contact, time zone" },
      { heading: "Shared goal and definition of success", required: true, budget: 50, affinity: "frame", purpose: "one goal both sides would state the same way" },
      { heading: "Ownership split (RACI)", required: true, budget: 110, affinity: "own", purpose: "a table — row = deliverable or decision, column = team" },
      { heading: "Interfaces between us", required: true, budget: 110, affinity: "own", purpose: "what each side hands over, in what format, by when" },
      { heading: "Decision rights and escalation path", required: true, budget: 70, affinity: "own", purpose: "who decides, who breaks a tie, and how fast" },
      { heading: "Communication plan", required: true, budget: 60, affinity: "comm", purpose: "channel, cadence, meeting, status format" },
      { heading: "Dependencies and critical dates", required: true, budget: 60, affinity: "comm", purpose: "a table, with the owner of each date" },
      { heading: "Decision log", required: true, budget: 60, affinity: "back", purpose: "a table: date, decision, who decided, why" },
      { heading: "Risks", required: true, budget: 50, affinity: "back", purpose: "each with an owner and a mitigation" },
      { heading: "Open questions", required: true, budget: 40, affinity: "back", purpose: "each with an owner" },
      { heading: "Revision history", required: true, budget: 20, affinity: "back", purpose: "a table: version, date, author, what changed" },
    ],
  },
  {
    type: "report",
    label: "Report — status / outcome report",
    about: "executive summary plus RAG, because the reader is skimming for one thing: is this on track, and what do you need from me",
    sections: [
      { heading: "Document info", required: true, budget: 20, affinity: "meta", purpose: "period covered, author, audience, distribution" },
      { heading: "Executive summary", required: true, budget: 30, affinity: "frame", purpose: "one to three sentences, ending in the ask" },
      { heading: "Overall status", required: true, budget: 50, affinity: "frame", purpose: "green / amber / red, plus a per-workstream RAG table" },
      { heading: "Results against target", required: true, budget: 60, affinity: "results", purpose: "a table: metric, target, actual, delta" },
      { heading: "What shipped this period", required: true, budget: 60, affinity: "results", purpose: "facts, with links" },
      { heading: "What is planned next period", required: true, budget: 60, affinity: "results", purpose: "commitments, with owners" },
      { heading: "Risks and issues", required: true, budget: 80, affinity: "risk", purpose: "a table: description, impact, owner, mitigation, due" },
      { heading: "Decisions needed from you", required: true, budget: 60, affinity: "risk", purpose: "the section that justifies the document existing" },
      { heading: "Effort and budget", required: false, budget: 40, affinity: "back", purpose: "optional — include it only if somebody asked" },
      { heading: "Milestones", required: true, budget: 40, affinity: "back", purpose: "a table: milestone, due, status" },
      { heading: "Evidence and links", required: true, budget: 40, affinity: "back", purpose: "where every number above came from" },
      { heading: "Revision history", required: true, budget: 20, affinity: "back", purpose: "a table: version, date, author, what changed" },
    ],
  },
  {
    type: "workflow",
    label: "Workflow — SOP / runbook",
    about: "purpose, scope, responsibilities, procedure — written for the least experienced person qualified to do the job",
    sections: [
      { heading: "Document info", required: true, budget: 20, affinity: "meta", purpose: "owner, version, approved by, next review date" },
      { heading: "Purpose", required: true, budget: 30, affinity: "frame", purpose: "what this procedure achieves" },
      { heading: "Scope: when to use this, and when not to", required: true, budget: 50, affinity: "frame", purpose: "both halves — the second one is the half people skip" },
      { heading: "Roles and responsibilities", required: true, budget: 50, affinity: "frame", purpose: "who may run this, and who must be told" },
      { heading: "Before you start", required: true, budget: 50, affinity: "proc", purpose: "access, tools and inputs you need in hand" },
      { heading: "The procedure", required: true, budget: 240, affinity: "proc", purpose: "numbered steps; each step: who does it, what they do, what they should see, how to confirm it worked" },
      { heading: "Decision points", required: true, budget: 60, affinity: "proc", purpose: "condition, then which step to go to" },
      { heading: "When it goes wrong", required: true, budget: 110, affinity: "fail", purpose: "a table: symptom, likely cause, what to do, how to roll back" },
      { heading: "Escalation", required: true, budget: 40, affinity: "fail", purpose: "who to contact, at what point, on what channel" },
      { heading: "Definitions", required: false, budget: 40, affinity: "back", purpose: "every term the least experienced reader would not know" },
      { heading: "Related documents", required: false, budget: 30, affinity: "back", purpose: "what this points at, and what points at this" },
      { heading: "Revision history", required: true, budget: 20, affinity: "back", purpose: "a table: version, date, author, what changed" },
    ],
  },
];
const DOC_TYPES = DOC_TEMPLATES.map((t) => t.type);
const docTemplate = (type) => DOC_TEMPLATES.find((t) => t.type === String(type || "").toLowerCase());

function docPaths(claudeDir, slug) {
  const root = repoRootOf(claudeDir);
  let rel = DOC_DIR_DEFAULT;
  try {
    rel = resolvedConfig(claudeDir).doc_dir || DOC_DIR_DEFAULT;
  } catch (_) {}
  const dir = path.isAbsolute(rel) ? rel : path.join(root, ...String(rel).split(/[\\/]/).filter(Boolean));
  const folder = slug ? path.join(dir, slug) : null;
  return {
    root,
    rel: String(rel).replace(/\\/g, "/"),
    dir,
    folder,
    state: folder ? path.join(folder, DOC_STATE_FILE) : null,
    document: folder ? path.join(folder, DOC_FILE) : null,
    outline: folder ? path.join(folder, DOC_OUTLINE_FILE) : null,
    work: folder ? path.join(folder, DOC_WORK) : null,
    // v0.49.0 — the real, visible, diffable source of truth.
    sections: folder ? path.join(folder, DOC_SECTIONS) : null,
    front: folder ? path.join(folder, DOC_SECTIONS, DOC_FRONT_FILE) : null,
    gaps: folder ? path.join(folder, DOC_GAPS_FILE) : null,
  };
}

// Where RESUME.md actually lives (v0.49.0). The registered v0.42.0 home, and
// the ONLY place `listRuns()` looks — which is why a document paused by a usage
// limit never appeared in `orc run list` and `orc resume` could not find it.
function docRunDir(claudeDir, slug) {
  try {
    return path.join(resolveRunDir(claudeDir), slug);
  } catch (_) {
    return null;
  }
}

const docRelFolder = (p, abs) => path.relative(p.folder, abs).split(path.sep).join("/");

function docRead(claudeDir, slug) {
  const p = docPaths(claudeDir, slug);
  if (!p.state || !fs.existsSync(p.state)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(p.state, "utf8"));
    d.outline = Array.isArray(d.outline) ? d.outline : [];
    d.sections = d.sections || {};
    d.extracts = d.extracts || {};
    d.cycles = Array.isArray(d.cycles) ? d.cycles : [];
    // BOTH versions are accepted. A v1 document in flight must open, migrate and
    // continue without the user knowing anything happened.
    d.version = Number(d.version) || 1;
    d.migrations = Array.isArray(d.migrations) ? d.migrations : [];
    return d;
  } catch (_) {
    return null;
  }
}

// doc.json HAS EXACTLY ONE WRITER — this function, reached only from an
// `orc doc` subcommand. A model never edits it, and never invents a line number.
function docWrite(claudeDir, slug, d) {
  const p = docPaths(claudeDir, slug);
  fs.mkdirSync(p.folder, { recursive: true });
  d.version = Number(d.version) || 1;
  d.updated_at = fmtStamp(new Date());
  fs.writeFileSync(p.state, JSON.stringify(d, null, 2) + "\n");
  return p.state;
}

function docList(claudeDir) {
  const p = docPaths(claudeDir);
  if (!fs.existsSync(p.dir)) return [];
  return fs
    .readdirSync(p.dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(p.dir, e.name, DOC_STATE_FILE)))
    .map((e) => e.name)
    .sort();
}

const docLines = (text) => String(text).replace(/\r\n/g, "\n").split("\n");
const docHash = (s) => sha256(String(s).replace(/\r\n/g, "\n").replace(/\s+$/, ""));

// The heading id: ordinal + the slugified heading. Stable across every rewrite
// of the BODY, which is what a re-check needs; an INSERTED section renumbers its
// followers, which is what the rename repair below is for.
const docSectionId = (n, heading) => `${two(n)}-${docSlugify(heading).slice(0, 40) || "section"}`;

// ── the section FILES — one file per thing, and ONE resolver (v0.49.0) ───────
// `docSectionSource` is the single answer to "what is this section's source?".
// Compile, `parts`, the staleness check, `extract` and the check-dispatch ALL
// call it. A second idea of what a section's source is would be exactly the
// drift this lane exists to prevent.

const docSectionFile = (p, id) => path.join(p.sections, id + ".md");
const docSectionDir = (p, id) => path.join(p.sections, id);

// Strip the template's purpose comments (instructions for the writer, never
// content), drop leading blanks, drop trailing whitespace. Blank-line
// normalisation happens ONCE, at the very end of a compile, so a nested join is
// never normalised twice.
function docTrimPart(text) {
  return docLines(text)
    .filter((l) => !/^\s*<!--\s*purpose:/i.test(l))
    .join("\n")
    .replace(/^\s*\n+/, "")
    .replace(/\s*$/, "");
}

const docFirstLine = (text) => (docLines(text).find((l) => /\S/.test(l)) || "").trim();

function docSectionSource(p, o) {
  const out = { id: o.id, files: [], parts: [], text: null, nested: false, problems: [] };
  if (!p.sections) return out;
  const flat = docSectionFile(p, o.id);
  if (fs.existsSync(flat) && fs.statSync(flat).isFile()) {
    const raw = fs.readFileSync(flat, "utf8");
    const rel = docRelFolder(p, flat);
    out.files.push(rel);
    out.parts.push({ sub: null, file: rel, hash: docHash(raw), lines: docLines(raw).length });
    out.text = docTrimPart(raw);
    return out;
  }
  const dir = docSectionDir(p, o.id);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return out;
  out.nested = true;
  // ORDER IS `outline[i].subsections[]` — never `readdir`, never the filename
  // number. Decision 4, one level down.
  const seq = [];
  const head = path.join(dir, DOC_HEAD_FILE);
  if (fs.existsSync(head)) seq.push({ sub: DOC_HEAD_FILE.replace(/\.md$/, ""), file: head, head: true });
  for (const s of o.subsections || []) {
    const f = path.join(dir, s.id + ".md");
    if (fs.existsSync(f)) seq.push({ sub: s.id, file: f, head: false, heading: s.heading });
  }
  if (!seq.length) return out;
  const chunks = [];
  for (const it of seq) {
    const raw = fs.readFileSync(it.file, "utf8");
    const body = docTrimPart(raw);
    const rel = docRelFolder(p, it.file);
    const first = docFirstLine(body);
    // Every rule here is a REFUSE-AND-NAME, never a silent fix. Demoting a `##`
    // to `###` would restructure the deliverable; promoting it would split one
    // section into two. Neither is ours to choose.
    if (!it.head) {
      if (/^##\s/.test(first))
        out.problems.push({ rule: "subpart-h2", file: rel, what: `${rel} starts with a \`## \` heading. A sub-part is part of ONE section — demoting it would restructure the document and promoting it would split the section in two. Neither is this lane's to choose.` });
      else if (!/^#{3,6}\s/.test(first))
        out.problems.push({ rule: "subpart-bad-level", file: rel, what: `${rel} does not start at \`### \` or deeper. A sub-part carries its own sub-heading; without one the compile cannot tell where it begins.` });
    }
    out.files.push(rel);
    out.parts.push({ sub: it.sub, file: rel, hash: docHash(raw), lines: docLines(raw).length });
    chunks.push(body);
  }
  out.text = chunks.join("\n\n");
  return out;
}

// Exactly one `## ` per section: `00-head.md` carries it, and when that file is
// absent the compile emits the outline's own heading. Never twice, never none.
function docSectionBody(o, src) {
  let body = src.text || "";
  if (!/^##\s/.test(docFirstLine(body))) body = `## ${o.heading}\n\n` + body;
  return body.replace(/\s*$/, "");
}

// `state` is COMPUTED from the disk every time, never stored as a claim.
//   planned      no source file at all
//   unconfirmed  a file exists but no VALIDATED RETURN ever recorded its hash —
//                exactly what a writer killed by a usage limit leaves behind
//   user-edited  the recorded hash no longer matches the file
//   checked      a check cycle confirmed it and it has not moved since
//   written      confirmed, not yet checked
function docPartState(rec, exists, hash) {
  if (!exists) return "planned";
  if (!rec || !rec.source_hash) return "unconfirmed";
  if (rec.source_hash !== hash) return "user-edited";
  return rec.state === "checked" ? "checked" : "written";
}

// The `sections/` view — and it works BEFORE a single compile has ever run,
// which is the whole reason a resumed session no longer needs `document.md`.
function docPartsView(claudeDir, slug) {
  const d = docRead(claudeDir, slug);
  if (!d) return null;
  const p = docPaths(claudeDir, slug);
  const rows = (d.outline || []).map((o, i) => {
    const src = docSectionSource(p, o);
    const rec = d.sections[o.id] || {};
    const exists = !!src.text;
    const hash = exists ? docHash(src.text) : null;
    return {
      id: o.id,
      heading: o.heading,
      required: o.required !== false,
      purpose: o.purpose || null,
      files: src.files,
      nested: src.nested,
      exists,
      lines: exists ? docLines(src.text).length : 0,
      hash,
      state: docPartState(rec, exists, hash),
      findings: rec.findings || 0,
      cycle: rec.cycle || null,
      subsections: (o.subsections || []).map((s) => {
        const part = src.parts.find((x) => x.sub === s.id);
        const known = (rec.parts || {})[s.id];
        return {
          id: s.id,
          heading: s.heading,
          file: part ? part.file : null,
          exists: !!part,
          lines: part ? part.lines : 0,
          hash: part ? part.hash : null,
          changed: !!(part && known && known !== part.hash),
        };
      }),
      // The NUMBER is a mirror of the outline index, kept in sync by the CLI.
      // Order is always the outline — the number is never what decides it.
      ordinal_ok: o.id === docSectionId(i + 1, o.heading),
      problems: src.problems,
    };
  });
  const front = p.front && fs.existsSync(p.front) ? docRelFolder(p, p.front) : null;
  return { d, paths: p, rows, front };
}

// `K of N` is DERIVED by counting waves whose sections are ALL hash-confirmed —
// never a number a model claims. Same discipline as every other state here.
function docWaveState(d, rows) {
  const waves = ((d.plan || {}).waves || []).filter(Array.isArray);
  if (!waves.length) return null;
  const done = new Set(rows.filter((r) => r.state === "written" || r.state === "checked").map((r) => r.id));
  let k = 0;
  for (const w of waves) {
    if (!w.length || !w.every((id) => done.has(id))) break;
    k++;
  }
  return { done: k, total: waves.length, role: (d.plan || {}).role || "write" };
}

// `document.md` is stale ⇔ some section's assembled source hashes differently
// today than `compiled.source_hashes` recorded. Pure disk comparison, no stored
// status word, and COVERAGE-RELATIVE — the `computeWikiFreshness` /
// `shipped-drifted` rule applied to a build artifact.
function docDocStale(view) {
  const d = view.d;
  const c = d.compiled;
  if (!c || !c.source_hashes) return null;
  const then = c.source_hashes;
  const out = [];
  for (const r of view.rows) {
    if (!r.exists) {
      if (then[r.id]) out.push({ id: r.id, heading: r.heading, reason: "gone" });
      continue;
    }
    if (!then[r.id]) out.push({ id: r.id, heading: r.heading, reason: "added" });
    else if (then[r.id] !== r.hash) out.push({ id: r.id, heading: r.heading, reason: "changed" });
  }
  return out;
}

// ORC's own markers, found in a body that is supposed to carry content only.
// REPORTED, never silently stripped: rule 4 outranks tidiness, because we cannot
// tell whose line it is.
function docAnnotations(text) {
  const out = [];
  docLines(text).forEach((l, i) => {
    if (DOC_ANNOTATION_RE.test(l)) out.push({ line: i + 1, quote: l.trim().slice(0, 160) });
  });
  return out;
}

// ── the section map — DERIVED, NEVER STORED (§5.2) ──────────────────────────
// Because it is re-derived after every single write, no line number in this
// system is ever stale. That is the entire reason range-based reading is safe.
function docScan(text) {
  const lines = docLines(text);
  const heads = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) heads.push({ line: i + 1, level: m[1].length, heading: m[2].replace(/[*_`]/g, "").trim() });
  }
  const h2 = heads.filter((h) => h.level === 2);
  const sections = h2.map((h, i) => {
    const start = h.line;
    const end = i + 1 < h2.length ? h2[i + 1].line - 1 : lines.length;
    const body = lines.slice(start - 1, end).join("\n");
    return {
      id: docSectionId(i + 1, h.heading),
      ordinal: i + 1,
      heading: h.heading,
      level: 2,
      start,
      end,
      lines: end - start + 1,
      hash: docHash(body),
      text: body,
    };
  });
  return {
    total_lines: lines.length,
    preamble_end: h2.length ? h2[0].line - 1 : lines.length,
    headings: heads,
    sections,
  };
}

// A heading whose TEXT changed but whose position and neighbours match is the
// SAME section with a new id — repaired, never lost. A heading that appears with
// no such match is new. Without this, one typo in a heading throws away that
// section's whole history.
// A SECTION'S IDENTITY COMES FROM THE OUTLINE, NEVER FROM ITS POSITION IN THE
// FILE. `docScan` can only number what it sees, and a skipped optional section
// shifts every ordinal after it — so a purely positional id would rename half
// the document the first time somebody dropped a section nobody asked for.
//
// Two passes, in this order:
//   1. exact heading match, consumed in document order — the normal case;
//   2. RENAME REPAIR for what is left: an unmatched section sitting between two
//      matched neighbours takes the one unconsumed outline entry between them.
//      A heading whose text changed but whose position and neighbours match is
//      the SAME section with a new name. Anything still unmatched is genuinely
//      new and keeps its positional id.
function docReconcile(d, scan) {
  const outline = d.outline || [];
  const bySlug = new Map();
  outline.forEach((o, i) => {
    const k = docSlugify(o.heading);
    if (!bySlug.has(k)) bySlug.set(k, []);
    bySlug.get(k).push(i);
  });
  const used = new Set();
  const sections = scan.sections.map((s) => ({ ...s, outline_index: null }));

  for (const s of sections) {
    const cands = bySlug.get(docSlugify(s.heading)) || [];
    const hit = cands.find((i) => !used.has(i));
    if (hit === undefined) continue;
    used.add(hit);
    s.outline_index = hit;
    s.id = outline[hit].id;
  }

  const repairs = [];
  const nextMatched = (from) => {
    for (let j = from; j < sections.length; j++) if (sections[j].outline_index !== null) return sections[j].outline_index;
    return outline.length;
  };
  for (let k = 0; k < sections.length; k++) {
    const s = sections[k];
    if (s.outline_index !== null) continue;
    const prev = k > 0 && sections[k - 1].outline_index !== null ? sections[k - 1].outline_index : -1;
    const next = nextMatched(k + 1);
    const gap = [];
    for (let i = prev + 1; i < next; i++) if (!used.has(i)) gap.push(i);
    // Exactly one candidate, or it is ambiguous and nothing is repaired: a
    // guessed identity is worse than a lost one, because it silently attaches a
    // section's whole history to the wrong text.
    if (gap.length !== 1) continue;
    const i = gap[0];
    used.add(i);
    s.outline_index = i;
    const from = outline[i].id;
    // The new id is built from the OUTLINE slot, so ids stay in outline order
    // even when the file's own ordinals do not.
    s.id = docSectionId(i + 1, s.heading);
    repairs.push({ from, to: s.id, heading: s.heading, index: i });
  }
  return { sections, repairs };
}

function docApplyRepairs(d, repairs) {
  for (const r of repairs) {
    const rec = d.sections[r.from];
    if (rec) {
      d.sections[r.to] = { ...rec, renamed_from: r.from };
      delete d.sections[r.from];
    }
    const o = (d.outline || [])[r.index] || (d.outline || []).find((x) => x.id === r.from);
    if (o) {
      o.id = r.to;
      o.heading = r.heading;
    }
    if (d.extracts && d.extracts[r.from]) {
      d.extracts[r.to] = d.extracts[r.from];
      delete d.extracts[r.from];
    }
  }
  return repairs.length;
}

// `state` is COMPUTED by comparing the live hash to the one doc.json recorded at
// the end of the last cycle — never stored as a claim. A stored status is a
// status that lies the moment somebody saves a file.
function docStateOfSection(rec, live, version) {
  if (!live) return "planned";
  // v1 ONLY. In v2 the deliverable carries content only, so nothing ever writes
  // a `> **Open:**` stub into the body and there is nothing to sniff for. A text
  // match was always strictly less reliable than the hash it sat beside.
  if ((Number(version) || 1) < 2 && /^\s*>\s*\*\*Open:/m.test(live.text) && live.lines <= 6) return "open";
  if (!rec || !rec.hash) return "written";
  if (rec.hash !== live.hash) return "user-edited";
  return DOC_STATES.includes(rec.state) && rec.state !== "planned" ? rec.state : "written";
}

function docMapView(claudeDir, slug, { persist = false } = {}) {
  const d = docRead(claudeDir, slug);
  if (!d) return null;
  const p = docPaths(claudeDir, slug);
  // `parts_only` lets a caller tell "not compiled yet" from "empty document" —
  // in v2 those are completely different situations and both are normal.
  if (!fs.existsSync(p.document))
    return { d, paths: p, document: null, sections: [], total_lines: 0, repairs: [], parts_only: true };
  const text = fs.readFileSync(p.document, "utf8");
  const scan = docScan(text);
  const { sections: resolved, repairs } = docReconcile(d, scan);
  // The repair is the ONE thing map writes, and it is a repair, not a claim:
  // without it the identity of a section a human renamed is lost forever, and
  // nothing else in this system ever runs after a hand edit.
  if (persist && repairs.length) {
    docApplyRepairs(d, repairs);
    docWrite(claudeDir, slug, d);
  }
  // The scan is re-keyed to the outline's ids, so `scan.sections` and the view
  // agree — `extract` reads the text off one and the hash off the other.
  scan.sections = resolved;
  const outline = d.outline || [];
  const sections = resolved.map((s) => {
    const rec = d.sections[s.id];
    const o = s.outline_index === null ? null : outline[s.outline_index];
    return {
      id: s.id,
      heading: s.heading,
      level: s.level,
      start: s.start,
      end: s.end,
      lines: s.lines,
      hash: s.hash,
      state: docStateOfSection(rec, s, d.version),
      required: o ? !!o.required : true,
      purpose: o ? o.purpose || null : null,
      findings: rec && rec.findings ? rec.findings : 0,
      cycle: rec && rec.cycle ? rec.cycle : null,
      renamed_from: (rec && rec.renamed_from) || null,
    };
  });
  return {
    d,
    paths: p,
    document: p.document,
    total_lines: scan.total_lines,
    preamble_end: scan.preamble_end,
    sections,
    scan,
    repairs,
  };
}

// The one status line every listing parses, so a listing never has to open
// doc.json. Same shape as the run trio's `Where it stands:` line.
function docWhereLine(d, view, extra) {
  const e = extra || {};
  // In v2 the SECTION FILES are the progress, so `written` is counted from them
  // when the caller has them — the count no longer waits for a compile.
  const written = Array.isArray(e.rows)
    ? e.rows.filter((r) => r.state === "written" || r.state === "checked").length
    : view
      ? view.sections.filter((s) => s.state !== "planned" && s.state !== "open").length
      : 0;
  const total = (d.outline || []).length || (view ? view.sections.length : 0);
  // The PREFIX is byte-stable — `orc doc list` parses it, which is how a listing
  // never has to open doc.json. v0.48.1 appends a SUFFIX and never touches the
  // rest; v0.49.0 appends one more, so `orc run list` finally shows phase AND
  // wave. `parseStands` splits on `·` and matches positionally-free.
  const base = `Where it stands:  /orc-doc · ${String(d.type || "").toUpperCase()} · cycle ${d.cycle || 0} · ${written} of ${total} sections written`;
  let line = base;
  if (d && d.shipped) {
    const drift = view ? docShipDrift(d, view) : null;
    line +=
      ` · shipped ${d.shipped.at.split(" ")[0]} → ${d.shipped.where}` +
      (drift && drift.length ? ` (drifted: ${plural(drift.length, "section")})` : "");
  }
  if (e.phase) line += ` · phase ${e.phase}`;
  if (e.wave) line += ` · wave ${e.wave.done} of ${e.wave.total}`;
  return line;
}

// ── the free check (§4.4 + §7) ──────────────────────────────────────────────
// Two honesty rules, printed by the command itself:
//   1. A readability signal is a SIGNAL, not a verdict. It never blocks.
//   2. It is English-specific and heuristic — passive detection is a pattern
//      match and a syllable count is an estimate. Say so, once, on the output.
// Its real payoff: the findings ride in the checker's slice, so a model never
// spends a token counting sentences.
const DOC_SENTENCE_MAX = 35;
const DOC_SENTENCE_AVG_MAX = 20;
const DOC_HARDWRAP_MIN = 60;

function docLintRun(text, targetId) {
  const tgt = docTarget(targetId);
  const lines = docLines(text);
  const findings = [];
  let seq = 0;
  const add = (severity, rule, line, what, quote) =>
    findings.push({
      id: "D-" + String(++seq).padStart(3, "0"),
      severity, // "error" blocks the handoff; "warn" is advisory
      rule,
      line,
      what,
      quote: quote ? String(quote).slice(0, 160) : null,
    });

  // front matter, first — every rule below counts lines from the same file
  const hasFront = /^---\s*$/.test(lines[0] || "");
  let frontEnd = 0;
  if (hasFront) {
    for (let i = 1; i < lines.length; i++)
      if (/^---\s*$/.test(lines[i])) {
        frontEnd = i + 1;
        break;
      }
  }
  if (tgt.front_matter === "require" && !hasFront)
    add("error", "front-matter-required", 1, `--target ${tgt.id} requires YAML front matter, and will not render the page without it`);
  if (tgt.front_matter === "ban" && hasFront)
    add("error", "front-matter-banned", 1, `--target ${tgt.id} renders YAML front matter as visible junk at the top of the page`);

  const scan = docScan(text);
  const h1 = scan.headings.filter((h) => h.level === 1);
  if (h1.length === 0) add("error", "no-h1", 1, "no H1 — every importer's outline builder starts from one");
  if (h1.length > 1)
    for (const h of h1.slice(1)) add("error", "many-h1", h.line, `a second H1: "${h.heading}". Exactly one is the title`);
  let prev = 0;
  for (const h of scan.headings) {
    if (prev && h.level > prev + 1)
      add("error", "skipped-level", h.line, `heading jumps from H${prev} to H${h.level} — the outline builder loses the branch`);
    prev = h.level;
    if (h.level > tgt.max_heading)
      add("error", "heading-too-deep", h.line, `H${h.level} is deeper than ${tgt.label} supports (max H${tgt.max_heading}) — it degrades to bold text`, h.heading);
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(h.heading))
      add("warn", "emoji-heading", h.line, "an emoji in a heading — some importers slug headings and mangle the anchor", h.heading);
  }

  // Setext headings survive nothing, and an underline that looks like a rule is
  // a heading the outline builder never sees.
  for (let i = 1; i < lines.length; i++)
    if (/^(=+|-{3,})\s*$/.test(lines[i]) && /\S/.test(lines[i - 1]) && !/^\s*[|>#-]/.test(lines[i - 1]) && i > frontEnd)
      add("error", "setext-heading", i + 1, "a setext (underlined) heading — use ATX (`##`) so every importer sees it", lines[i - 1]);

  let fence = false;
  let fenceLang = true;
  let tableCols = 0;
  let prevProse = null;
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const l = lines[i];
    if (n <= frontEnd) continue;

    const fm = l.match(/^\s*(```|~~~)(\s*[A-Za-z0-9_+-]*)/);
    if (fm) {
      if (!fence) {
        fence = true;
        fenceLang = !!(fm[2] || "").trim();
        if (fm[1] === "~~~") add("error", "tilde-fence", n, "a `~~~` fence — only ``` fences convert reliably");
        else if (!fenceLang) add("warn", "fence-no-language", n, "a code fence with no language tag");
      } else fence = false;
      prevProse = null;
      continue;
    }
    if (fence) continue;

    if (/^\s{4,}\S/.test(l) && !/^\s*[-*+\d]/.test(l) && !/^\s*\|/.test(l))
      add("warn", "indented-code", n, "an indented code block — it converts unreliably; use a ``` fence");

    if (/<!--/.test(l)) add("error", "html-comment", n, "an HTML comment — some importers render it as literal text", l.trim());
    if (/<(table|div|span|br|img|p|b|i|u|font|sup|sub)\b[^>]*>/i.test(l))
      add("error", "raw-html", n, "raw HTML — it survives almost no import path", l.trim());

    if (/\[\[[^\]]+\]\]/.test(l)) add("error", "wikilink", n, "a [[wikilink]] — Obsidian-only syntax", l.trim());
    if (/\[\^[^\]]+\]/.test(l)) add("error", "footnote", n, "a footnote — Pandoc-only syntax", l.trim());
    if (/^:\s+\S/.test(l) && /\S/.test(lines[i - 1] || "")) add("warn", "definition-list", n, "a definition list — Pandoc-only syntax", l.trim());

    for (const m of l.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
      if (!m[1].trim()) add("error", "image-no-alt", n, "an image with no alt text — the alt text is what survives an import", m[0]);
      const near = (lines[i + 1] || "") + (lines[i - 1] || "");
      if (!/\S/.test(near))
        add("warn", "image-no-description", n, "an image with no one-line text description beside it — images do not travel through most imports", m[0]);
    }

    if (/^\s*\|/.test(l)) {
      const cells = l.trim().replace(/^\||\|$/g, "").split("|").length;
      if (/^\s*\|[\s:|-]+\|?\s*$/.test(l)) {
        // the delimiter row — it defines the column count
      } else if (!tableCols) tableCols = cells;
      else if (cells !== tableCols)
        add("warn", "ragged-table", n, `a table row with ${cells} cells where the header has ${tableCols} — complex tables flatten on import`, l.trim());
      prevProse = null;
      continue;
    }
    tableCols = 0;

    // THE HARD-WRAP RULE — the single most common import-mangling bug. A wrap at
    // 80 columns becomes a line break INSIDE a Notion or Docs paragraph.
    const isProse = /\S/.test(l) && !/^\s*[-*+>#|]/.test(l) && !/^\s*\d+[.)]\s/.test(l);
    if (
      isProse &&
      prevProse &&
      !prevProse.reported &&
      prevProse.text.length >= DOC_HARDWRAP_MIN &&
      !/[.:;!?]\s*$/.test(prevProse.text)
    )
      add("error", "hard-wrap", prevProse.n, "a hard-wrapped paragraph — one paragraph must be one line, or the wrap becomes a line break on import", prevProse.text);
    // ONE finding per paragraph. A five-line wrapped paragraph is one mistake,
    // and reporting it four times buries the other rules.
    prevProse = isProse ? { n, text: l.trim(), reported: !!(prevProse && (prevProse.reported || prevProse.text.length >= DOC_HARDWRAP_MIN)) } : null;

    for (const marker of LINT_MARKERS)
      if (l.includes(marker)) {
        add("warn", "placeholder", n, `leftover placeholder text: ${marker}`, l.trim());
        break;
      }
  }

  // ── the clean-deliverable rule (v0.49.0) ──────────────────────────────────
  // The deliverable carries CONTENT ONLY. ORC's own bookkeeping — an Open, an
  // Assumption, a note callout, an `orc-doc:` fence — belongs in `gaps.md` and
  // in the journal, not in the document the reader came for.
  //
  // It uses the SAME helper the compile reports with, so the free check and the
  // build can never disagree about what one of ORC's markers is. And the set is
  // narrow on purpose: a user's own line beginning "Note:" is content.
  for (const a of docAnnotations(text))
    add("error", "annotation-in-body", a.line, "ORC bookkeeping in the deliverable — it belongs in gaps.md, not in the document", a.quote);

  // ── readability signals (§7) ──────────────────────────────────────────────
  const prose = proseLines(text).filter((p) => /\S/.test(p.text) && !/^\s*#/.test(p.text));
  const sentences = [];
  for (const p of prose)
    for (const raw of p.text.split(/(?<=[.!?])\s+/)) {
      const words = raw.trim().split(/\s+/).filter(Boolean);
      if (words.length) sentences.push({ line: p.n, words: words.length, text: raw.trim() });
    }
  const totalWords = sentences.reduce((a, s) => a + s.words, 0);
  const avg = sentences.length ? Math.round((totalWords / sentences.length) * 10) / 10 : 0;
  const longest = sentences.reduce((a, s) => (!a || s.words > a.words ? s : a), null);
  for (const s of sentences)
    if (s.words > DOC_SENTENCE_MAX)
      add("warn", "long-sentence", s.line, `a ${s.words}-word sentence — one idea per sentence, and the bar is ${DOC_SENTENCE_MAX}`, s.text);

  const longWords = sentences.reduce(
    (a, s) => a + s.text.split(/\s+/).filter((w) => syllables(w) >= 4).length,
    0
  );
  let passive = 0;
  for (const p of prose) passive += (p.text.match(PASSIVE_RE) || []).length;

  const seenAcr = new Set();
  const undefinedAcr = [];
  for (const p of prose)
    for (const m of p.text.matchAll(/\b([A-Z]{2,6})\b/g)) {
      const a = m[1];
      if (LINT_COMMON_ACRONYMS.has(a) || seenAcr.has(a)) continue;
      seenAcr.add(a);
      // "expanded on first use" looks like `Something Something (ABC)` or
      // `ABC (something something)`.
      const expanded = new RegExp(`\\(${a}\\)|${a}\\s*\\(`).test(p.text);
      if (!expanded) {
        undefinedAcr.push({ acronym: a, line: p.n });
        add("warn", "undefined-acronym", p.n, `"${a}" is used without being expanded on first use`, p.text.trim().slice(0, 120));
      }
    }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  return {
    target: tgt.id,
    target_label: tgt.label,
    max_heading: tgt.max_heading,
    front_matter: tgt.front_matter,
    lines: lines.length,
    findings,
    errors,
    warnings,
    readability: {
      sentences: sentences.length,
      avg_sentence_words: avg,
      avg_bar: DOC_SENTENCE_AVG_MAX,
      longest_sentence_words: longest ? longest.words : 0,
      longest_sentence_line: longest ? longest.line : null,
      long_word_pct: totalWords ? Math.round((longWords / totalWords) * 100) : 0,
      passive_constructions: passive,
      undefined_acronyms: undefinedAcr,
    },
    honesty: [
      "A readability signal is a SIGNAL, not a verdict. This never blocks anything.",
      "It is English-specific and heuristic: passive voice is a pattern match and a syllable count is an estimate.",
    ],
    import_note: tgt.imports === "native" ? null : tgt.watch,
  };
}

// ── the commands ────────────────────────────────────────────────────────────

function docInit(claudeDir) {
  const asJson = wantsJson();
  const pos = docPositionals(); // ["doc","init",<slug?>]
  const fail = (reason, hint, code = 2) => {
    if (asJson) emitJson({ ok: false, reason, hint }, code);
    console.error("❌ " + hint);
    process.exit(code);
  };
  const type = String(docOpt("--type") || "").toLowerCase();
  const tpl = docTemplate(type);
  const custom = docOpt("--template");
  if (!type) fail("no-type", `orc doc init needs --type <${DOC_TYPES.join("|")}>.`);
  if (!tpl) fail("bad-type", `--type must be one of: ${DOC_TYPES.join(", ")}`);
  const explicit = docSlugify(pos[2] || "");
  if (!explicit) fail("no-slug", "orc doc init needs a slug (it becomes the folder name).");
  // The folder is `<slug>-<DDMMYY>`, so the same subject on two days is two
  // documents and neither silently overwrites the other.
  const folderSlug = /-\d{6}$/.test(explicit) ? explicit : explicit + "-" + docStamp();
  const paths = docPaths(claudeDir, folderSlug);
  if (fs.existsSync(paths.state)) fail("exists", `a document named ${folderSlug} already exists at ${paths.folder}`, 1);

  let sections = tpl.sections.map((s) => ({ ...s }));
  let templateSource = "shipped:" + tpl.type;
  if (custom) {
    const abs = path.isAbsolute(custom) ? custom : path.join(paths.root, custom);
    if (!fs.existsSync(abs)) fail("no-such-template", `template not found: ${custom}`);
    // A user template REPLACES the shipped one entirely. Its headings become the
    // outline; its body text is instructions for the writer, never content to
    // copy through. The two are never merged silently.
    const heads = docScan(fs.readFileSync(abs, "utf8")).sections;
    if (!heads.length)
      fail(
        "no-headings",
        `no \`## \` headings found in ${custom}. A structure is never guessed out of prose — ` +
          `show the user the shipped ${tpl.type} outline and ask which to use.`
      );
    sections = heads.map((h) => ({ heading: h.heading, required: true, budget: 120, affinity: null, purpose: null }));
    templateSource = custom;
  }

  const outline = sections.map((s, i) => ({
    id: docSectionId(i + 1, s.heading),
    heading: s.heading,
    level: 2,
    required: s.required !== false,
    purpose: s.purpose || null,
    affinity: s.affinity || null,
    budget_lines: s.budget || 120,
  }));

  const target = String(docOpt("--target") || "generic").toLowerCase();
  if (!DOC_TARGETS.some((t) => t.id === target))
    fail("bad-target", `--target must be one of: ${DOC_TARGETS.map((t) => t.id).join(", ")}`);
  const length = String(docOpt("--length") || "standard").toLowerCase();
  if (!DOC_LENGTHS.includes(length)) fail("bad-length", `--length must be one of: ${DOC_LENGTHS.join(", ")}`);

  const cfg = resolvedConfig(claudeDir);
  const d = {
    version: DOC_STATE_VERSION,
    slug: folderSlug,
    type: tpl.type,
    title: docOpt("--title") || folderSlug.replace(/-\d{6}$/, "").replace(/-/g, " "),
    language: docOpt("--language") || cfg.doc_language || "en",
    target,
    length,
    template: { source: templateSource, label: tpl.label },
    created_at: fmtStamp(new Date()),
    cycle: 0,
    outline,
    write_mode: cfg.doc_write_mode && cfg.doc_write_mode !== "ask" ? cfg.doc_write_mode : null,
    sections: {},
    extracts: {},
    cycles: [],
    migrations: [],
  };
  // `sections/` is a REAL, VISIBLE folder — a hidden dot-folder is not something
  // a human opens, edits, or reviews in a PR, and half the point is that you can
  // read one section without opening the document.
  fs.mkdirSync(paths.sections, { recursive: true });
  docWrite(claudeDir, folderSlug, d);
  docWriteOutline(claudeDir, folderSlug, d);

  const oversized = outline.filter((o) => o.budget_lines > Number(cfg.doc_max_lines_per_agent || 400));
  if (asJson)
    emitJson(
      {
        ok: true,
        slug: folderSlug,
        dir: paths.folder,
        type: tpl.type,
        target,
        language: d.language,
        outline,
        oversized: oversized.map((o) => o.id),
        sections_dir: path.relative(paths.root, paths.sections).split(path.sep).join("/"),
        write_mode: d.write_mode,
        next: `orc doc plan ${folderSlug} --role write`,
      },
      0
    );
  console.log(ui.header(`ORC · doc — ${folderSlug} created`));
  console.log(`\n  type:      ${tpl.label}`);
  console.log(`  template:  ${templateSource}`);
  console.log(`  target:    ${docTarget(target).label}`);
  console.log(`  sections:  ${outline.length}   (${outline.filter((o) => o.required).length} required)`);
  console.log(`  folder:    ${paths.folder}`);
  console.log(`\n  Next:  orc doc plan ${folderSlug} --role write`);
  process.exit(0);
}

// outline.md is DERIVED from doc.json and rewritten whenever the outline
// changes. It is the writer/orchestrator contract in a form a human can read —
// and having one writer is what stops the two disagreeing about section order.
function docWriteOutline(claudeDir, slug, d) {
  const p = docPaths(claudeDir, slug);
  const L = [
    "<!-- orc-doc:derived — written by the `orc doc` CLI from doc.json.",
    "     Change the outline with `orc doc outline <slug> --set <file>`; a hand",
    "     edit here is overwritten the next time anything writes. -->",
    "",
    `# Outline — ${d.title}`,
    "",
    `Type: ${d.type} · Language: ${d.language} · Target: ${d.target} · Length: ${d.length}`,
    "",
    "| # | Section | Required | Budget | Purpose |",
    "|---|---|---|---|---|",
    ...d.outline.map(
      (o, i) =>
        `| ${i + 1} | ${o.heading} | ${o.required ? "yes" : "no"} | ${o.budget_lines} | ${o.purpose || "—"} |` +
        ((o.subsections || []).length ? `\n| | ${o.subsections.map((s) => "· " + s.heading).join("<br>")} | | | stored as parts |` : "")
    ),
    "",
    "A required section with no material is NOT written. It is returned as a gap,",
    "recorded in gaps.md, and raised with you — the deliverable carries content only.",
    "",
    "One file per section under `sections/`. `document.md` is a build artifact:",
    "rebuild it any time, for free, with `orc doc compile`.",
    "",
  ];
  fs.writeFileSync(p.outline, L.join("\n"));
  return p.outline;
}

function docOutlineCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const d = slug ? docRead(claudeDir, slug) : null;
  if (!d) return docNoSuch(asJson, slugArg);
  const set = docOpt("--set");
  if (set) {
    const p = docPaths(claudeDir, slug);
    const abs = path.isAbsolute(set) ? set : path.join(p.root, set);
    if (!fs.existsSync(abs)) {
      if (asJson) emitJson({ ok: false, reason: "no-such-file", path: set }, 2);
      console.error(`❌ not found: ${set}`);
      process.exit(2);
    }
    const heads = docScan(fs.readFileSync(abs, "utf8")).sections;
    if (!heads.length) {
      if (asJson) emitJson({ ok: false, reason: "no-headings", path: set }, 2);
      console.error(`❌ no \`## \` headings in ${set} — a structure is never guessed out of prose.`);
      process.exit(2);
    }
    const old = new Map(d.outline.map((o) => [docSlugify(o.heading), o]));
    const renames = [];
    d.outline = heads.map((h, i) => {
      const prev = old.get(docSlugify(h.heading));
      const id = docSectionId(i + 1, h.heading);
      if (prev && prev.id !== id) renames.push({ from: prev.id, to: id });
      return {
        id,
        heading: h.heading,
        level: 2,
        required: prev ? prev.required : true,
        purpose: prev ? prev.purpose : null,
        affinity: prev ? prev.affinity : null,
        budget_lines: prev ? prev.budget_lines : 120,
        subsections: prev ? prev.subsections || [] : [],
      };
    });
    // The filename NUMBER is a mirror of the outline index, and the CLI is what
    // keeps it in sync. A renumber renames the files on disk in the SAME step —
    // otherwise `audit` would report `part-misnumbered` on a document nobody
    // touched, and the section's whole history would sit under a dead name.
    const p2 = docPaths(claudeDir, slug);
    for (const r of renames) {
      for (const [from, to] of [[docSectionFile(p2, r.from), docSectionFile(p2, r.to)], [docSectionDir(p2, r.from), docSectionDir(p2, r.to)]])
        if (fs.existsSync(from) && !fs.existsSync(to)) {
          try { fs.renameSync(from, to); } catch (_) {}
        }
      if (d.sections[r.from]) {
        d.sections[r.to] = { ...d.sections[r.from], renamed_from: r.from };
        delete d.sections[r.from];
      }
    }
    docWrite(claudeDir, slug, d);
    docWriteOutline(claudeDir, slug, d);
    if (renames.length && !asJson)
      for (const r of renames) console.log(`  renamed: ${r.from} → ${r.to}`);
  }
  if (asJson) emitJson({ ok: true, slug, outline: d.outline, file: docPaths(claudeDir, slug).outline }, 0);
  console.log(ui.header(`ORC · doc outline — ${slug}`));
  d.outline.forEach((o, i) =>
    console.log(`  ${String(i + 1).padStart(3)}  ${o.required ? " " : "·"} ${o.heading.padEnd(44)} ${String(o.budget_lines).padStart(4)} L`)
  );
  process.exit(0);
}

// A prefix is enough, because the folder carries a date suffix nobody memorises.
function docResolveSlug(claudeDir, raw) {
  const want = String(raw || "");
  if (!want) return null;
  const all = docList(claudeDir);
  if (all.includes(want)) return want;
  const hits = all.filter((s) => s.startsWith(want));
  return hits.length === 1 ? hits[0] : null;
}

function docNoSuch(asJson, slugArg) {
  const hint = `no document "${slugArg || ""}" — \`orc doc list\` shows the ones that exist (a prefix is enough).`;
  if (asJson) emitJson({ ok: false, reason: "no-such-doc", slug: slugArg || null, hint }, 2);
  console.log(hint);
  process.exit(2);
}

function docListCmd(claudeDir) {
  const asJson = wantsJson();
  const slugs = docList(claudeDir);
  // A listing must NOT mutate, so `list` is the one command that never triggers
  // the lazy migration.
  const rows = slugs.map((s) => {
    const view = docMapView(claudeDir, s);
    const d = view.d;
    const v2 = d.version >= DOC_STATE_VERSION;
    const pv = docPartsView(claudeDir, s);
    const written = v2
      ? pv.rows.filter((x) => x.state === "written" || x.state === "checked").length
      : view.sections.filter((x) => x.state !== "planned" && x.state !== "open").length;
    return {
      slug: s,
      version: d.version,
      title: d.title,
      type: d.type,
      target: d.target,
      language: d.language,
      cycle: d.cycle || 0,
      // It may only claim what the disk proves: a missing document.md means
      // NOT STARTED, never "failed".
      document: view.document && fs.existsSync(view.document) ? "present" : "not started",
      lines: view.total_lines,
      sections_total: (d.outline || []).length,
      sections_written: written,
      user_edited: (v2 ? pv.rows : view.sections).filter((x) => x.state === "user-edited").map((x) => x.id),
      where: docWhereLine(d, view, { rows: v2 ? pv.rows : null, wave: docWaveState(d, pv.rows) }),
      dir: view.paths.folder,
      next: `/orc-doc resume ${s}`,
    };
  });
  if (asJson) emitJson({ ok: true, dir: docPaths(claudeDir).rel, documents: rows, total: rows.length }, 0);
  if (!rows.length) {
    console.log("no documents yet — run `/orc-doc` to start one (it asks what you want written first, and never invents it).");
    process.exit(0);
  }
  console.log(ui.header(`ORC · doc — ${plural(rows.length, "document")}`));
  console.log("");
  for (const r of rows) {
    console.log(`  ${r.type.toUpperCase().padEnd(14)} ${r.slug}`);
    console.log(`  ${"".padEnd(14)} ${ui.color.gray(r.where)}`);
    if (r.user_edited.length)
      console.log(`  ${"".padEnd(14)} ${ui.color.gray("you edited: " + r.user_edited.join(", "))}`);
  }
  process.exit(0);
}

function docShowCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const view = slug ? docMapView(claudeDir, slug) : null;
  if (!view) return docNoSuch(asJson, slugArg);
  const d = view.d;

  // ONE section's text, on an explicit request. This is the only command that
  // returns any of the document's prose, and it is deliberately one section at a
  // time: the rule is that nothing HOLDS the document, not that the text is
  // secret. A caller that asked for a named section has already decided to spend
  // the context on it.
  const want = docOpt("--section");
  if (want) {
    const s = (view.sections || []).find((x) => x.id === want || x.id.startsWith(want));
    if (!s || !view.scan) {
      const hint = `no section "${want}" in ${slug} — \`orc doc map ${slug}\` lists them.`;
      if (asJson) emitJson({ ok: false, reason: "no-such-section", slug, section: want, hint }, 2);
      console.error("❌ " + hint);
      process.exit(2);
    }
    const scanned = view.scan.sections.find((x) => x.id === s.id);
    if (asJson)
      emitJson(
        { ok: true, slug, section: s.id, heading: s.heading, start: s.start, end: s.end, lines: s.lines, state: s.state, hash: s.hash, text: scanned.text },
        0
      );
    console.log(scanned.text);
    process.exit(0);
  }

  // v0.48.1 — the memory fields. `created_at` was already in doc.json and was
  // never emitted: the CLI knew when a document started and never said so. That
  // is a bug fix, not a feature.
  const jr = docJournalRows(claudeDir, slug);
  const ctx = docContextSources(docContextPaths(view.paths), view.paths.root);
  const payload = {
    ok: true,
    slug,
    title: d.title,
    type: d.type,
    language: d.language,
    target: d.target,
    length: d.length,
    template: d.template,
    cycle: d.cycle || 0,
    created_at: d.created_at || null,
    last_touched_at: d.updated_at || null,
    sessions: docSessionCount(claudeDir, slug),
    dir: view.paths.folder,
    document: view.document && fs.existsSync(view.document) ? view.document : null,
    total_lines: view.total_lines,
    outline: d.outline,
    sections: view.sections,
    extracts: d.extracts,
    // Per cycle: the role, the sections it touched, the findings it raised, and
    // the agent + model that ran it. It was all in doc.json and effectively
    // invisible.
    cycles: (d.cycles || []).map((c, i) => ({
      n: c.n || i + 1,
      at: c.at || null,
      role: c.role || null,
      sections: c.sections || [],
      findings: c.findings || 0,
      agents: c.agents || null,
      model: c.model || null,
      effort: c.effort || null,
    })),
    journal: jr ? jr.rows : [],
    context: ctx,
    shipped: d.shipped || null,
    ship_history: d.ship_history || [],
    lock: d.lock || null,
    where: docWhereLine(d, view),
  };
  if (asJson) emitJson(payload, 0);
  console.log(ui.header(`ORC · doc ${slug} — ${d.title}`));
  console.log(`\n  ${docWhereLine(d, view)}\n`);
  for (const s of view.sections)
    console.log(
      `  ${s.state.padEnd(12)} ${String(s.start).padStart(5)}..${String(s.end).padEnd(5)} ` +
        `${String(s.lines).padStart(4)}L  ${s.heading}` +
        (s.findings ? `  ${ui.color.gray(plural(s.findings, "finding"))}` : "")
    );
  process.exit(0);
}

function docMapCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const view = slug ? docMapView(claudeDir, slug, { persist: true }) : null;
  if (!view) return docNoSuch(asJson, slugArg);
  if (!view.document || !fs.existsSync(view.document)) {
    const hint = `no ${DOC_FILE} yet for ${slug} — nothing has been assembled.`;
    if (asJson) emitJson({ ok: false, reason: "no-document", slug, hint }, 2);
    console.log(hint);
    process.exit(2);
  }
  const payload = {
    ok: true,
    slug,
    file: path.relative(view.paths.root, view.document).split(path.sep).join("/"),
    lines: view.total_lines,
    preamble_end: view.preamble_end,
    sections: view.sections.map(({ id, heading, level, start, end, lines, hash, state, required, findings, renamed_from }) => ({
      id, heading, level, start, end, lines, hash, state, required, findings, renamed_from,
    })),
    repaired: view.repairs,
    note: "line numbers are DERIVED on every read and never stored — a stored line number is a wrong line number one edit later",
  };
  if (asJson) emitJson(payload, 0);
  console.log(ui.header(`ORC · doc map — ${slug}  (${view.total_lines} lines)`));
  console.log("");
  for (const s of view.sections)
    console.log(
      `  ${s.id.padEnd(30)} ${String(s.start).padStart(5)}..${String(s.end).padEnd(5)} ` +
        `${String(s.lines).padStart(4)}L  ${s.state.padEnd(12)} ${s.hash.slice(0, 8)}`
    );
  if (view.repairs.length)
    for (const r of view.repairs) console.log(`\n  repaired: ${r.from} → ${r.to} (heading renamed; history kept)`);
  process.exit(0);
}

// ── the batching — the model NEVER decides how to split (§5.4) ──────────────
function docPlanCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  if (slug) docMigrateV2(claudeDir, slug);
  const view = slug ? docMapView(claudeDir, slug) : null;
  if (!view) return docNoSuch(asJson, slugArg);
  const d = view.d;
  const cfg = resolvedConfig(claudeDir);
  const v2 = d.version >= DOC_STATE_VERSION;
  const pv = v2 ? docPartsView(claudeDir, slug) : null;
  const only = String(docOpt("--only") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const writeMode = d.write_mode || (cfg.doc_write_mode === "ask" ? null : cfg.doc_write_mode);
  const role = String(docOpt("--role") || "write").toLowerCase();
  if (!DOC_ROLES.includes(role)) {
    if (asJson) emitJson({ ok: false, reason: "bad-role", hint: `--role must be one of: ${DOC_ROLES.join(", ")}` }, 2);
    console.error(`❌ --role must be one of: ${DOC_ROLES.join(", ")}`);
    process.exit(2);
  }
  const budget = Math.max(40, Number(docOpt("--budget") || cfg.doc_max_lines_per_agent || 400));
  const wanted = Math.max(1, Number(cfg.doc_max_parallel || DOC_MAX_PARALLEL_CAP));
  const parallel = Math.min(DOC_MAX_PARALLEL_CAP, wanted);
  const clamped = wanted > DOC_MAX_PARALLEL_CAP ? { from: wanted, to: parallel } : null;

  const live = new Map(view.sections.map((s) => [s.id, s]));
  const byPart = pv ? new Map(pv.rows.map((r) => [r.id, r])) : null;
  // ONE FILE PER SECTION, never per slice. Before v0.49.0 a slice covering two
  // sections wrote ONE file named after the first, while compile looked up a
  // file per outline id — so the second section's file never existed. That was a
  // live bug; one file per section fixes it by construction.
  const partFile = (o) => {
    if (!v2) return `${DOC_WORK}/${o.id}.md`;
    const row = byPart ? byPart.get(o.id) : null;
    if (row && row.nested) return `${DOC_SECTIONS}/${o.id}/`;
    return `${DOC_SECTIONS}/${o.id}.md`;
  };
  let items = [];
  if (role === "write") {
    // Only what has no body yet, plus anything a wave left `unconfirmed`. A
    // `user-edited` section is NEVER re-written without an instruction naming
    // it — overwriting a human's paragraph is unrecoverable from this side.
    items = d.outline
      .filter((o) => {
        if (v2) {
          const r = byPart.get(o.id);
          return !r || r.state === "planned" || r.state === "unconfirmed";
        }
        const s = live.get(o.id);
        return !s || s.state === "planned" || s.state === "open";
      })
      .map((o) => ({
        id: o.id,
        heading: o.heading,
        required: !!o.required,
        purpose: o.purpose,
        affinity: o.affinity,
        budget_lines: o.budget_lines,
        part: partFile(o),
        subsections: (o.subsections || []).map((s) => ({ id: s.id, heading: s.heading, file: `${DOC_SECTIONS}/${o.id}/${s.id}.md` })),
      }));
  } else if (role === "check") {
    // The hash is what turns a re-check from a full pass into a diff: a section
    // whose hash has not moved since it was checked does not need re-reading.
    // In v2 a checker gets one bounded PART FILE, so there is no line arithmetic
    // anywhere in the loop.
    items = v2
      ? pv.rows
          .filter((r) => r.exists && r.state !== "checked")
          .map((r) => {
            const o = d.outline.find((x) => x.id === r.id) || {};
            return {
              id: r.id,
              heading: r.heading,
              required: r.required,
              purpose: r.purpose,
              affinity: o.affinity || null,
              budget_lines: r.lines,
              part: partFile(o),
              files: r.files,
              // Only the sub-parts that MOVED are re-read. A single changed
              // sub-part in a 900-line section costs one ~150-line read.
              changed_subparts: r.subsections.filter((s) => s.changed).map((s) => s.file),
            };
          })
      : view.sections
          .filter((s) => s.state !== "planned" && s.state !== "checked")
          .map((s) => ({
            id: s.id,
            heading: s.heading,
            required: s.required,
            purpose: s.purpose,
            affinity: (d.outline.find((o) => o.id === s.id) || {}).affinity || null,
            budget_lines: s.lines,
            start: s.start,
            end: s.end,
          }));
  } else {
    items = (v2 ? pv.rows : view.sections)
      .filter((s) => s.findings > 0)
      .map((s) => {
        const o = d.outline.find((x) => x.id === s.id) || { id: s.id };
        return {
          id: s.id,
          heading: s.heading,
          required: s.required,
          purpose: s.purpose,
          affinity: null,
          budget_lines: s.lines,
          start: s.start,
          end: s.end,
          part: partFile(o),
          files: v2 ? s.files : undefined,
        };
      });
  }
  if (only.length) items = items.filter((it) => only.some((k) => it.id === k || it.id.startsWith(k)));

  const agentName = role === "check" ? "orc-doc-checker-opus-5-low" : "orc-doc-writer-opus-5-med";

  if (!items.length) {
    // An empty result is an ANSWER, so it returns the SAME object shape with an
    // empty wave list — a caller must never have to special-case "nothing to do"
    // by parsing prose or by finding half the keys missing.
    const hint =
      role === "write"
        ? "every section already has a body — nothing to write."
        : role === "check"
          ? "every section has been checked since it last changed — nothing to re-read."
          : "no section carries an open finding — nothing to edit.";
    if (asJson)
      emitJson(
        {
          ok: true, slug, role, agent: agentName, budget_lines: budget, parallel, clamped,
          write_mode: writeMode, waves: [], agents: 0, more_waves: 0, only: only.length ? only : null,
          oversized: [], hint,
          note: "no section is ever split across two agents, and no two agents ever share a file",
        },
        1
      );
    console.log(hint);
    process.exit(1);
  }

  // Pack in outline order, and NEVER split a section — a writer given half a
  // section writes half an idea. Sections that reference each other (Goals ↔
  // Non-goals, Alternatives ↔ Detailed design) share an `affinity` and are kept
  // in the SAME agent wherever the budget allows: cross-agent consistency is
  // expensive to check and free to prevent.
  const groups = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && it.affinity && last.affinity === it.affinity) last.items.push(it);
    else groups.push({ affinity: it.affinity, items: [it] });
  }
  const slices = [];
  let cur = null;
  const push = (sections, oversized) => {
    cur = { sections: [...sections], budget_lines: sections.reduce((a, x) => a + x.budget_lines, 0), oversized: !!oversized };
    slices.push(cur);
  };
  for (const g of groups) {
    const total = g.items.reduce((a, x) => a + x.budget_lines, 0);
    if (total <= budget) {
      if (cur && !cur.oversized && cur.budget_lines + total <= budget) {
        cur.sections.push(...g.items);
        cur.budget_lines += total;
      } else push(g.items, false);
      continue;
    }
    // The group does not fit whole: split it, still never splitting a section.
    for (const it of g.items) {
      if (it.budget_lines > budget) {
        // A single section over the cap is a PLANNING SMELL, not something to
        // dispatch anyway: the lane offers to split it into sub-sections at the
        // outline gate rather than handing a writer an over-budget slice.
        push([it], true);
        cur = null;
        continue;
      }
      if (cur && !cur.oversized && cur.budget_lines + it.budget_lines <= budget) {
        cur.sections.push(it);
        cur.budget_lines += it.budget_lines;
      } else push([it], false);
    }
  }

  const agent = agentName;
  const allWaves = [];
  for (let i = 0; i < slices.length; i += parallel) {
    const group = slices.slice(i, i + parallel);
    allWaves.push({
      n: allWaves.length + 1,
      agents: group.map((s) => {
        const out = {
          agent,
          sections: s.sections.map((x) => x.id),
          headings: s.sections.map((x) => x.heading),
          budget_lines: s.budget_lines,
          oversized: !!s.oversized,
        };
        // ONE ENTRY PER SECTION — and per SUB-PART for a nested section. The
        // singular `part` is kept as parts[0].file for one release, because
        // `next` output gets copied into notes and scripts.
        if (role !== "check" || v2)
          out.parts = s.sections.flatMap((x) =>
            (x.subsections || []).length
              ? x.subsections.map((sub) => ({ id: x.id, subsection: sub.id, file: sub.file, heading: sub.heading, purpose: x.purpose, budget_lines: x.budget_lines }))
              : [{ id: x.id, subsection: null, file: x.part, heading: x.heading, purpose: x.purpose, budget_lines: x.budget_lines }]
          );
        if (out.parts && out.parts.length) out.part = out.parts[0].file;
        if (!v2 && (role === "check" || role === "edit")) {
          // v1 documents keep the RANGE form on the alias path:
          // Read(file_path, offset=start, limit=end-start+1).
          out.range = [s.sections[0].start, s.sections[s.sections.length - 1].end];
          out.read_limit = out.range[1] - out.range[0] + 1;
        }
        if (v2 && role === "check") {
          out.files = s.sections.flatMap((x) => x.files || []);
          out.changed_subparts = s.sections.flatMap((x) => x.changed_subparts || []);
        }
        return out;
      }),
    });
  }

  // PARTIAL is a first-class mode, and it returns WAVE 1 ONLY — the rest cannot
  // be bought by accident. This is the single biggest saving in the lane: you
  // read what wave 1 wrote and redirect before waves 2..N are paid for.
  const partial = role === "write" && writeMode === "partial" && !only.length;
  const waves = partial ? allWaves.slice(0, 1) : allWaves;
  const agents = waves.reduce((a, w) => a + w.agents.length, 0);

  // The wave list is PERSISTED so `K of N` can be DERIVED later by counting
  // waves whose sections are all hash-confirmed — never claimed by a model.
  if (role === "write" && !only.length) {
    d.plan = { role, at: fmtStamp(new Date()), waves: allWaves.map((w) => w.agents.flatMap((a) => a.sections)) };
    docWrite(claudeDir, slug, d);
  }

  const payload = {
    ok: true,
    slug,
    role,
    agent,
    budget_lines: budget,
    parallel,
    clamped,
    write_mode: writeMode,
    waves,
    agents,
    more_waves: partial ? allWaves.length - 1 : 0,
    only: only.length ? only : null,
    oversized: slices.filter((s) => s.oversized).map((s) => s.sections[0].id),
    hint: null,
    note: "no section is ever split across two agents, and no two agents ever share a file",
  };
  if (asJson) emitJson(payload, 0);
  console.log(ui.header(`ORC · doc plan — ${slug} · ${role}`));
  if (clamped)
    console.log(
      `\n  ⚠ doc_max_parallel ${clamped.from} clamped to the hard cap ${clamped.to} — ` +
        "more parallel writers is more chances for the outline to drift."
    );
  for (const w of waves) {
    console.log(`\n  wave ${w.n}`);
    for (const a of w.agents)
      console.log(
        `    ${a.agent}  ${String(a.budget_lines).padStart(4)}L  ${a.sections.join(" + ")}` +
          (a.range ? `   lines ${a.range[0]}..${a.range[1]}` : "") +
          (a.oversized ? "   ⚠ over budget — split it, or store it in parts" : "")
      );
  }
  console.log(`\n  ${plural(agents, "agent")} across ${plural(waves.length, "wave")}.`);
  if (partial)
    console.log(
      ui.color.gray(
        `  partial mode: ${plural(payload.more_waves, "later wave")} not returned. Read wave 1's files, then ask for the next.`
      )
    );
  process.exit(0);
}

// ── extract → edit the part → splice back (§5.6) ────────────────────────────
// v0.49.0: both survive as THIN ALIASES for one release. `orc doc next` output
// gets copied into notes and scripts, and a v1 document mid-flight still emits
// them. In v2 the section file IS the extract, so `extract` makes no copy.
function docExtractCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  // NO lazy migration here: a v1 document must reach the v1 extract, so its
  // recorded hash still guards the splice that follows.
  const d0 = slug ? docRead(claudeDir, slug) : null;
  if (d0 && d0.version >= DOC_STATE_VERSION) {
    const p = docPaths(claudeDir, slug);
    const want = String(docOpt("--section") || "");
    const entry = (d0.outline || []).find((x) => x.id === want || x.id.startsWith(want));
    const src = entry ? docSectionSource(p, entry) : null;
    if (!entry || !src || !src.text) {
      const hint = `no written section "${want}" in ${slug} — \`orc doc parts ${slug}\` lists them.`;
      if (asJson) emitJson({ ok: false, reason: "no-such-section", slug, section: want || null, hint }, 2);
      console.error("❌ " + hint);
      process.exit(2);
    }
    const hash = docHash(src.text);
    const prev = d0.sections[entry.id] || {};
    d0.sections[entry.id] = { ...prev, source_hash: prev.source_hash || hash };
    docWrite(claudeDir, slug, d0);
    if (asJson) emitJson({ ok: true, slug, section: entry.id, files: src.files, file: src.files[0], lines: docLines(src.text).length, hash, alias: "extract" }, 0);
    console.log(`✓ ${entry.id} already lives at ${src.files[0]} — the section file IS the source, so nothing was copied.`);
    console.log(`  Edit it, then: orc doc compile ${slug}`);
    process.exit(0);
  }
  const view = slug ? docMapView(claudeDir, slug) : null;
  if (!view) return docNoSuch(asJson, slugArg);
  if (!view.document || !fs.existsSync(view.document)) {
    if (asJson) emitJson({ ok: false, reason: "no-document", slug }, 2);
    console.error(`❌ no ${DOC_FILE} yet for ${slug}.`);
    process.exit(2);
  }
  const want = String(docOpt("--section") || "");
  const s = view.sections.find((x) => x.id === want) || view.sections.find((x) => x.id.startsWith(want));
  if (!s) {
    const hint = `no section "${want}" in ${slug} — \`orc doc map ${slug}\` lists them.`;
    if (asJson) emitJson({ ok: false, reason: "no-such-section", section: want || null, hint }, 2);
    console.error("❌ " + hint);
    process.exit(2);
  }
  const scanned = view.scan.sections.find((x) => x.id === s.id);
  const p = view.paths;
  fs.mkdirSync(p.work, { recursive: true });
  const rel = `${DOC_WORK}/${s.id}.md`;
  fs.writeFileSync(path.join(p.folder, rel), scanned.text.replace(/\s*$/, "") + "\n");
  const d = view.d;
  d.extracts[s.id] = { file: rel, hash: s.hash, start: s.start, end: s.end, at: fmtStamp(new Date()) };
  docWrite(claudeDir, slug, d);
  if (asJson) emitJson({ ok: true, slug, section: s.id, file: rel, start: s.start, end: s.end, lines: s.lines, hash: s.hash }, 0);
  console.log(`✓ ${s.id} extracted to ${rel}  (lines ${s.start}..${s.end}, ${s.lines} L)`);
  console.log(`  Edit ONLY that file. Then: orc doc splice ${slug}`);
  process.exit(0);
}

function docSpliceCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const d0 = slug ? docRead(claudeDir, slug) : null;
  if (!d0) return docNoSuch(asJson, slugArg);
  // A v1-era recorded `.work/` part is drained into sections/ first, hash-guarded
  // exactly as before — the refuse-by-name block below is preserved verbatim on
  // the v1 path, because two sessions on one slug is still a real risk.
  if (d0.version >= DOC_STATE_VERSION || !Object.keys(d0.extracts || {}).length) {
    docMigrateV2(claudeDir, slug);
    return docCompileCmd(claudeDir, slugArg, { alias: "splice" });
  }
  const view = slug ? docMapView(claudeDir, slug) : null;
  if (!view) return docNoSuch(asJson, slugArg);
  const d = view.d;
  const p = view.paths;
  const ids = Object.keys(d.extracts || {});
  if (!ids.length) {
    if (asJson) emitJson({ ok: true, slug, spliced: [], hint: "nothing is extracted" }, 1);
    console.log("nothing is extracted — `orc doc extract <slug> --section <id>` first.");
    process.exit(1);
  }
  const live = new Map(view.sections.map((s) => [s.id, s]));
  // REFUSE on a conflict, by section NAME. The user edited that section while we
  // were working, and overwriting a human's paragraph is unrecoverable from this
  // lane's side — the part file is gone and their wording with it.
  const conflicts = [];
  const missing = [];
  for (const id of ids) {
    const rec = d.extracts[id];
    const s = live.get(id);
    if (!s) {
      missing.push(id);
      continue;
    }
    if (s.hash !== rec.hash) conflicts.push({ id, heading: s.heading, was: rec.hash.slice(0, 8), now: s.hash.slice(0, 8) });
    if (!fs.existsSync(path.join(p.folder, rec.file))) missing.push(id);
  }
  if (conflicts.length || missing.length) {
    const payload = {
      ok: false,
      reason: conflicts.length ? "hash-conflict" : "missing-part",
      slug,
      conflicts,
      missing,
      hint: conflicts.length
        ? `these sections changed on disk after they were extracted: ${conflicts.map((c) => c.heading).join(", ")}. ` +
          "Nothing was written. Ask before overwriting — a human's wording is not recoverable from here."
        : `these part files are missing: ${missing.join(", ")}`,
    };
    if (asJson) emitJson(payload, 1);
    console.error("❌ " + payload.hint);
    process.exit(1);
  }

  // BOTTOM-UP (highest start first), so an edit that changes a section's length
  // never shifts a range that has not been spliced yet. This is why the model
  // never does line arithmetic.
  const order = ids
    .map((id) => ({ id, ...d.extracts[id], live: live.get(id) }))
    .sort((a, b) => b.live.start - a.live.start);
  let lines = docLines(fs.readFileSync(p.document, "utf8"));
  const spliced = [];
  for (const e of order) {
    const body = docLines(fs.readFileSync(path.join(p.folder, e.file), "utf8"));
    while (body.length && !/\S/.test(body[body.length - 1])) body.pop();
    const before = e.live.end - e.live.start + 1;
    lines.splice(e.live.start - 1, before, ...body);
    spliced.push({ id: e.id, heading: e.live.heading, was_lines: before, now_lines: body.length, delta: body.length - before });
  }
  fs.writeFileSync(p.document, lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "") + "\n");

  d.extracts = {};
  d.cycle = (d.cycle || 0) + 1;
  const body = fs.readFileSync(p.document, "utf8");
  const after = docScan(body);
  const rec = docReconcile(d, after);
  docApplyRepairs(d, rec.repairs);
  after.sections = rec.sections;
  for (const s of after.sections) {
    const prev = d.sections[s.id] || {};
    const touched = spliced.some((x) => x.id === s.id);
    d.sections[s.id] = {
      ...prev,
      hash: s.hash,
      state: touched ? "written" : prev.state || "written",
      cycle: touched ? d.cycle : prev.cycle || d.cycle,
      findings: touched ? 0 : prev.findings || 0,
    };
  }
  d.cycles.push({ n: d.cycle, at: fmtStamp(new Date()), kind: "edit", agents: spliced.length, sections: spliced.map((s) => s.id) });
  docWrite(claudeDir, slug, d);

  const lint = docLintRun(body, d.target);
  const payload = {
    ok: true,
    slug,
    spliced,
    lines: after.total_lines,
    lint: { errors: lint.errors, warnings: lint.warnings },
    note: "the map and the lint were re-derived after the write — no line number in this system is ever stale",
  };
  if (asJson) emitJson(payload, 0);
  console.log(`✓ ${plural(spliced.length, "section")} spliced back, bottom-up.`);
  for (const s of spliced) console.log(`    ${s.id.padEnd(30)} ${s.was_lines} → ${s.now_lines} L  (${s.delta >= 0 ? "+" : ""}${s.delta})`);
  console.log(`\n  ${DOC_FILE} is now ${after.total_lines} lines · lint ${lint.errors} errors, ${lint.warnings} warnings`);
  console.log(ui.color.gray("  Bottom-up: the highest section is replaced first, so no range shifts before it is used."));
  process.exit(0);
}

// ── compile — `document.md` is a BUILD ARTIFACT (v0.49.0) ───────────────────
// ZERO model tokens, zero subprocess, zero shell script. It is Node code in this
// same process, which is better than a shell step: no quoting, identical on
// Windows, and it can re-derive doc.json in the same pass. Measured cost is I/O
// only — outline.length reads, one write, one docScan.
//
// Anyone who claims v0.49.0 made compiling cheaper is selling something: it was
// already free. The saving is early review, a resumable wave, no round trip and
// bounded reads.
function docCompileCmd(claudeDir, slugArg, opts) {
  const o = opts || {};
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const pv = slug ? docPartsView(claudeDir, slug) : null;
  if (!pv) return docNoSuch(asJson, slugArg);
  docMigrateV2(claudeDir, slug);
  const view = docPartsView(claudeDir, slug);
  const d = view.d;
  const p = view.paths;
  const partial = o.partial || flag("--partial");
  const strip = flag("--strip-annotations");
  const alias = o.alias || null;

  const present = [];
  const missing = [];
  const skippedOptional = [];
  const problems = [];
  for (const row of view.rows) {
    const entry = d.outline.find((x) => x.id === row.id);
    const src = docSectionSource(p, entry);
    if (src.problems.length) problems.push(...src.problems);
    if (src.text) present.push({ o: entry, src, row });
    else if (row.required) missing.push({ id: row.id, heading: row.heading });
    else skippedOptional.push(row.id);
  }

  // A nested section that would restructure the deliverable is a REFUSAL, named
  // by file. Never a silent demote, never a silent promote.
  if (problems.length) {
    const hint = "cannot compile — " + problems.map((x) => x.what).join("  ·  ");
    if (asJson) emitJson({ ok: false, reason: "subpart-shape", slug, problems, hint }, 1);
    console.error("❌ " + hint);
    process.exit(1);
  }

  if (missing.length && !partial) {
    const hint =
      `cannot compile — ${plural(missing.length, "required section")} ${missing.length === 1 ? "has" : "have"} no source file: ` +
      missing.map((m) => m.id).join(", ") +
      ". Write them, or see what exists so far with --partial.";
    if (asJson) emitJson({ ok: false, reason: "missing-part", slug, missing: missing.map((m) => m.id), hint }, 1);
    console.error("❌ " + hint);
    process.exit(1);
  }

  // Partial: a missing section is simply ABSENT. It is NOT stubbed with a note —
  // the deliverable carries content only. The omission is reported loudly
  // OUTSIDE the document: here, in `status`, in `next` and in `audit`.
  // `00-front.md` is reserved for anything above the first `## ` — front matter
  // for a Docusaurus target, an exec summary a human typed, the H1 itself. It
  // survives a round trip instead of being regenerated, which is what makes
  // `split` → `compile` byte-for-byte.
  const out = [];
  let front = null;
  if (p.front && fs.existsSync(p.front)) front = docTrimPart(fs.readFileSync(p.front, "utf8"));
  if (front) out.push(front, "");
  if (!front || !/^#\s/m.test(front)) out.push(`# ${d.title}`, "");
  for (const x of present) out.push(docSectionBody(x.o, x.src), "");

  let body = out.join("\n");
  const annotations = docAnnotations(body);
  let stripped = [];
  if (strip && annotations.length) {
    stripped = annotations.map((a) => a.quote);
    body = docLines(body).filter((l) => !DOC_ANNOTATION_RE.test(l)).join("\n");
  }
  // ONCE, at the very end — so a nested join is never normalised twice.
  body = body.replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "") + "\n";

  fs.mkdirSync(p.folder, { recursive: true });
  fs.writeFileSync(p.document, body);

  d.cycle = (d.cycle || 0) + 1;
  const scan = docScan(body);
  // Re-key to the outline before recording a hash: a skipped optional section
  // shifts every ordinal after it, and a hash filed under a positional id would
  // make the next `map` read the whole document as renamed.
  scan.sections = docReconcile(d, scan).sections;
  for (const s of scan.sections) {
    const prev = d.sections[s.id] || {};
    const row = view.rows.find((r) => r.id === s.id);
    d.sections[s.id] = {
      ...prev,
      hash: s.hash,
      state: row && row.state === "unconfirmed" ? "unconfirmed" : prev.state === "checked" ? "checked" : "written",
      cycle: d.cycle,
      findings: prev.findings || 0,
    };
  }
  // `source_hashes` IS the staleness mechanism, and it is why nothing has to be
  // remembered: `document.md` is stale ⇔ some section's source hashes
  // differently today than this recorded. Pure disk comparison.
  const sourceHashes = {};
  for (const x of present) sourceHashes[x.o.id] = x.row.hash;
  d.compiled = {
    at: fmtStamp(new Date()),
    cycle: d.cycle,
    partial: !!missing.length,
    sections: present.map((x) => x.o.id),
    missing: missing.map((m) => m.id),
    source_hashes: sourceHashes,
  };
  d.cycles.push({
    n: d.cycle,
    at: fmtStamp(new Date()),
    kind: "compile",
    role: "compile",
    agents: 0,
    sections: present.map((x) => x.o.id),
  });
  docWrite(claudeDir, slug, d);
  docWriteOutline(claudeDir, slug, d);

  const lint = docLintRun(body, d.target);
  const mv = docMapView(claudeDir, slug);
  const after = docPartsView(claudeDir, slug);
  const payload = {
    ok: true,
    slug,
    file: path.relative(p.root, p.document).split(path.sep).join("/"),
    sections: scan.sections.length,
    lines: scan.total_lines,
    partial: !!missing.length,
    missing: missing.map((m) => ({ id: m.id, heading: m.heading })),
    skipped_optional: skippedOptional,
    annotations,
    stripped,
    lint: { errors: lint.errors, warnings: lint.warnings },
    where: docWhereLine(d, mv, { rows: after.rows, wave: docWaveState(d, after.rows) }),
    note: "document.md is a BUILD ARTIFACT — the files under sections/ are the source of truth",
  };
  if (asJson) emitJson(payload, 0);
  if (alias) console.log(ui.color.gray(`  \`orc doc ${alias}\` is now \`orc doc compile\` — same result, and the section files are the source.`));
  console.log(`✓ compiled ${plural(scan.sections.length, "section")} → ${p.document}  (${scan.total_lines} lines)`);
  if (missing.length)
    console.log(
      ui.color.yellow(`  PARTIAL — ${plural(missing.length, "required section")} not written yet: `) +
        missing.map((m) => m.heading).join(", ") +
        "\n  " +
        ui.color.gray("Absent, not stubbed. The document carries content only.")
    );
  if (annotations.length && !strip)
    console.log(
      ui.color.yellow(`  ${plural(annotations.length, "ORC annotation")} still in the body`) +
        ` (first at line ${annotations[0].line}). Reported, never silently removed — we cannot tell whose line it is.` +
        `\n  Remove them with:  orc doc compile ${slug} --strip-annotations`
    );
  if (stripped.length) console.log(ui.color.gray(`  stripped ${plural(stripped.length, "annotation")} on your explicit request.`));
  console.log(`  lint: ${lint.errors} errors, ${lint.warnings} warnings  ·  run \`orc doc lint ${slug}\` for the detail`);
  process.exit(0);
}

// ── parts — the wave-boundary command, and it works before any compile ──────
// `--confirm <ids>` is how a VALIDATED RETURN becomes a recorded hash. Until
// then a part file on disk is `unconfirmed`: a writer killed by a usage limit
// leaves a truncated file, and detection is already paid for.
function docPartsCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  if (!slug || !docRead(claudeDir, slug)) return docNoSuch(asJson, slugArg);
  docMigrateV2(claudeDir, slug);

  const confirm = String(docOpt("--confirm") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (confirm.length) {
    const view = docPartsView(claudeDir, slug);
    const d = view.d;
    const unknown = [];
    const empty = [];
    const confirmed = [];
    for (const want of confirm) {
      const row = view.rows.find((r) => r.id === want || r.id.startsWith(want));
      if (!row) {
        unknown.push(want);
        continue;
      }
      if (!row.exists) {
        empty.push(row.id);
        continue;
      }
      const entry = d.outline.find((x) => x.id === row.id);
      const src = docSectionSource(view.paths, entry);
      const prev = d.sections[row.id] || {};
      const parts = {};
      for (const pt of src.parts) if (pt.sub) parts[pt.sub] = pt.hash;
      d.sections[row.id] = { ...prev, source_hash: row.hash, state: "written", cycle: d.cycle || 0, findings: prev.findings || 0, parts };
      confirmed.push(row.id);
    }
    if (unknown.length || empty.length) {
      const hint =
        (unknown.length ? `no such section: ${unknown.join(", ")}. ` : "") +
        (empty.length ? `nothing on disk for: ${empty.join(", ")} — a return cannot confirm a file that was never written. ` : "");
      if (asJson) emitJson({ ok: false, reason: unknown.length ? "no-such-section" : "no-source", slug, unknown, empty, confirmed, hint }, 1);
      console.error("❌ " + hint);
      process.exit(1);
    }
    docWrite(claudeDir, slug, d);
  }

  const view = docPartsView(claudeDir, slug);
  const d = view.d;
  const wave = docWaveState(d, view.rows);
  const problems = view.rows.flatMap((r) => r.problems.map((x) => ({ id: r.id, ...x })));
  const missing = view.rows.filter((r) => r.required && !r.exists).map((r) => r.id);
  const unconfirmed = view.rows.filter((r) => r.state === "unconfirmed").map((r) => r.id);
  const misnumbered = view.rows.filter((r) => !r.ordinal_ok).map((r) => r.id);
  const payload = {
    ok: true,
    slug,
    dir: path.relative(view.paths.root, view.paths.sections).split(path.sep).join("/"),
    front: view.front,
    confirmed: confirm.length ? confirm : [],
    parts: view.rows.map(({ id, heading, required, files, nested, exists, lines, hash, state, subsections, ordinal_ok, findings }) => ({
      id, heading, required, files, nested, exists, lines, hash, state, subsections, ordinal_ok, findings,
    })),
    total: view.rows.length,
    written: view.rows.filter((r) => r.state === "written" || r.state === "checked").length,
    missing,
    unconfirmed,
    misnumbered,
    problems,
    wave,
    note: "the section files ARE the progress — there is no checkpoint file to invent and none to drift",
  };
  const code = missing.length || unconfirmed.length ? 1 : 0;
  if (asJson) emitJson(payload, code);
  console.log(ui.header(`ORC · doc parts — ${slug}`));
  if (wave) console.log(`\n  wave ${wave.done} of ${wave.total} confirmed`);
  console.log("");
  for (const r of view.rows) {
    console.log(
      `  ${r.state.padEnd(12)} ${String(r.lines).padStart(4)}L  ${r.id.padEnd(32)} ${r.files[0] || ui.color.gray("(not written)")}` +
        (r.ordinal_ok ? "" : ui.color.yellow("   ⚠ number does not mirror the outline"))
    );
    for (const s of r.subsections)
      console.log(`  ${"".padEnd(12)} ${String(s.lines).padStart(4)}L    ${s.id.padEnd(30)} ${s.file || ui.color.gray("(not written)")}`);
  }
  if (unconfirmed.length)
    console.log(
      ui.color.yellow(`\n  ${plural(unconfirmed.length, "part")} on disk with no validated return: `) +
        unconfirmed.join(", ") +
        "\n  " +
        ui.color.gray("A wave killed mid-flight leaves exactly this. It is re-written, never shipped.")
    );
  process.exit(code);
}

// ── split — the reverse direction, also free ────────────────────────────────
// `docScan` already returns every `##` section with its exact text and
// `docReconcile` already re-keys those to outline ids. So decomposing a monolith
// costs nothing, and it is what the migration uses — and what recovers a
// document a human reshaped by hand in an editor.
function docSplitSections(claudeDir, slug, d, p) {
  if (!fs.existsSync(p.document)) return { written: [], front: null, reason: "no-document" };
  const text = fs.readFileSync(p.document, "utf8");
  const scan = docScan(text);
  if (!scan.sections.length) return { written: [], front: null, reason: "no-headings" };
  const rec = docReconcile(d, scan);
  docApplyRepairs(d, rec.repairs);
  fs.mkdirSync(p.sections, { recursive: true });
  const written = [];
  for (const s of rec.sections) {
    // A section body that is nothing but a `> **Open:**` stub does NOT survive
    // into v2. It becomes `planned`, so the pipeline offers to write it.
    const bodyOnly = docLines(s.text).slice(1).filter((l) => /\S/.test(l));
    if (bodyOnly.length && bodyOnly.every((l) => DOC_ANNOTATION_RE.test(l))) continue;
    const file = docSectionFile(p, s.id);
    fs.writeFileSync(file, s.text.replace(/\s*$/, "") + "\n");
    written.push({ id: s.id, file: docRelFolder(p, file), lines: s.lines });
  }
  let front = null;
  if (scan.preamble_end > 0) {
    const pre = docLines(text).slice(0, scan.preamble_end).join("\n").replace(/\s*$/, "");
    if (/\S/.test(pre)) {
      fs.writeFileSync(p.front, pre + "\n");
      front = docRelFolder(p, p.front);
    }
  }
  return { written, front, repairs: rec.repairs, reason: null };
}

// Cut ONE existing flat section on its own `###` headings, so a big section
// stores as sub-parts without the reader ever knowing. The deliverable's
// structure is never changed to solve ORC's storage problem.
function docSplitByHeading(p, d, id) {
  const entry = (d.outline || []).find((x) => x.id === id || x.id.startsWith(id));
  if (!entry) return { ok: false, reason: "no-such-section" };
  const flat = docSectionFile(p, entry.id);
  if (!fs.existsSync(flat)) return { ok: false, reason: "no-source" };
  const text = fs.readFileSync(flat, "utf8");
  const lines = docLines(text);
  const scan = docScan(text);
  const h3 = scan.headings.filter((h) => h.level === 3);
  if (!h3.length) return { ok: false, reason: "no-subheadings" };
  const slugs = h3.map((h) => docSlugify(h.heading));
  if (new Set(slugs).size !== slugs.length) return { ok: false, reason: "ambiguous-subheadings" };

  const dir = docSectionDir(p, entry.id);
  fs.mkdirSync(dir, { recursive: true });
  const outFiles = [];
  const head = lines.slice(0, h3[0].line - 1).join("\n").replace(/\s*$/, "");
  fs.writeFileSync(path.join(dir, DOC_HEAD_FILE), head + "\n");
  outFiles.push(docRelFolder(p, path.join(dir, DOC_HEAD_FILE)));
  const subs = [];
  h3.forEach((h, i) => {
    const end = i + 1 < h3.length ? h3[i + 1].line - 1 : lines.length;
    const sid = docSectionId(i + 1, h.heading);
    const f = path.join(dir, sid + ".md");
    fs.writeFileSync(f, lines.slice(h.line - 1, end).join("\n").replace(/\s*$/, "") + "\n");
    subs.push({ id: sid, heading: h.heading, level: 3 });
    outFiles.push(docRelFolder(p, f));
  });
  fs.unlinkSync(flat);
  entry.subsections = subs;
  return { ok: true, id: entry.id, files: outFiles, subsections: subs };
}

function docSplitCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const d = slug ? docRead(claudeDir, slug) : null;
  if (!d) return docNoSuch(asJson, slugArg);
  const p = docPaths(claudeDir, slug);
  const one = docOpt("--section");

  if (one || flag("--by-heading")) {
    const res = docSplitByHeading(p, d, one || "");
    if (!res.ok) {
      const hints = {
        "no-such-section": `no section "${one}" in ${slug} — \`orc doc parts ${slug}\` lists them.`,
        "no-source": `${one} has no source file yet — there is nothing to split.`,
        "no-subheadings": `${one} has no \`### \` headings, so there is nothing to cut on. Add sub-headings first, or make them real \`## \` sections at the outline gate.`,
        "ambiguous-subheadings": `${one} has two identical \`### \` headings. Ambiguous is a refusal, never a guess — rename one.`,
      };
      const code = res.reason === "no-such-section" ? 2 : 1;
      if (asJson) emitJson({ ok: false, reason: res.reason, slug, section: one || null, hint: hints[res.reason] }, code);
      console.error("❌ " + hints[res.reason]);
      process.exit(code);
    }
    docWrite(claudeDir, slug, d);
    docWriteOutline(claudeDir, slug, d);
    if (asJson) emitJson({ ok: true, slug, section: res.id, files: res.files, subsections: res.subsections }, 0);
    console.log(`✓ ${res.id} stored as ${plural(res.files.length, "part")} under sections/${res.id}/`);
    for (const f of res.files) console.log(`    ${f}`);
    console.log(ui.color.gray("\n  Invisible to the reader: the compiled document still has exactly one `## ` for this section."));
    process.exit(0);
  }

  const res = docSplitSections(claudeDir, slug, d, p);
  if (res.reason) {
    const hint =
      res.reason === "no-document"
        ? `no ${DOC_FILE} for ${slug} — there is nothing to split. The section files are already the source.`
        : `${DOC_FILE} has no \`## \` headings at all. A structure is never guessed out of prose, so nothing was written.`;
    const code = res.reason === "no-document" ? 1 : 2;
    if (asJson) emitJson({ ok: false, reason: res.reason, slug, hint }, code);
    console.error("❌ " + hint);
    process.exit(code);
  }
  for (const w of res.written) {
    const prev = d.sections[w.id] || {};
    const entry = d.outline.find((x) => x.id === w.id);
    const src = entry ? docSectionSource(p, entry) : null;
    d.sections[w.id] = { ...prev, source_hash: src && src.text ? docHash(src.text) : null, state: prev.state === "checked" ? "checked" : "written" };
  }
  docWrite(claudeDir, slug, d);
  if (asJson) emitJson({ ok: true, slug, written: res.written, front: res.front, repaired: res.repairs || [] }, 0);
  console.log(`✓ ${plural(res.written.length, "section")} written to sections/`);
  for (const w of res.written) console.log(`    ${w.file.padEnd(46)} ${w.lines} L`);
  if (res.front) console.log(`    ${res.front.padEnd(46)} (everything above the first heading)`);
  process.exit(0);
}

// ── migration v1 → v2 — lazy, free, idempotent, non-destructive ─────────────
// A v1 document in flight must open, migrate and continue without the user
// knowing anything happened, and without losing a byte. Runs on the first
// `orc doc <anything> <slug>` where version < 2 — never on `list`, because a
// listing must not mutate.
function docMigrateV2(claudeDir, slug, opts) {
  const o = opts || {};
  const d = docRead(claudeDir, slug);
  if (!d || d.version >= DOC_STATE_VERSION) return null;
  const p = docPaths(claudeDir, slug);
  const notes = [];

  // Refuse rather than guess. A guessed structure is worse than none — the
  // `docInit` no-headings precedent.
  if (fs.existsSync(p.document)) {
    const scan = docScan(fs.readFileSync(p.document, "utf8"));
    if (!scan.sections.length)
      return {
        refused: true,
        slug,
        reason: "unparseable-document",
        hint:
          `${DOC_FILE} has no \`## \` headings, so its sections cannot be recovered. Nothing was written and the document stays on v1 — ` +
          "a guessed structure is worse than none.",
      };
  }

  fs.mkdirSync(p.sections, { recursive: true });
  let sections = [];

  if (fs.existsSync(p.document)) {
    const res = docSplitSections(claudeDir, slug, d, p);
    sections = res.written.map((w) => w.id);
    notes.push(`${plural(sections.length, "section")} recovered from ${DOC_FILE}; the file itself was NOT deleted — it is the build artifact now.`);
    if (res.front) notes.push("everything above the first heading kept in sections/00-front.md");
  }

  // A recorded extract is the NEWER edit, so it wins for that id.
  const extracts = Object.keys(d.extracts || {});
  for (const id of extracts) {
    const rec = d.extracts[id];
    const src = rec && rec.file ? path.join(p.folder, rec.file) : null;
    if (!src || !fs.existsSync(src)) continue;
    fs.writeFileSync(docSectionFile(p, id), fs.readFileSync(src, "utf8"));
    if (!sections.includes(id)) sections.push(id);
    notes.push(`${rec.file} was a pending extract — the newer edit, so it won for ${id}.`);
  }
  d.extracts = {};

  // Mid-write: part files exist and nothing was ever assembled. MOVE them.
  if (!fs.existsSync(p.document) && p.work && fs.existsSync(p.work)) {
    for (const f of fs.readdirSync(p.work).filter((x) => x.endsWith(".md"))) {
      const id = f.replace(/\.md$/, "");
      const dst = docSectionFile(p, id);
      if (fs.existsSync(dst)) continue;
      fs.writeFileSync(dst, fs.readFileSync(path.join(p.work, f), "utf8"));
      try { fs.unlinkSync(path.join(p.work, f)); } catch (_) {}
      if (!sections.includes(id)) sections.push(id);
    }
    if (sections.length) notes.push(`${plural(sections.length, "part file")} moved out of ${DOC_WORK}/ — nothing had been assembled yet.`);
  }

  // The v0.42.0 home is the only place `listRuns()` looks, which is why a
  // document paused by a usage limit never showed up in `orc run list`.
  const legacyResume = p.folder ? path.join(p.folder, RESUME_FILE) : null;
  if (legacyResume && fs.existsSync(legacyResume)) {
    const runDir = docRunDir(claudeDir, slug);
    if (runDir) {
      fs.mkdirSync(runDir, { recursive: true });
      // The `## ` prefix made `parseStands` — which is line-anchored — unable to
      // match the ONE line the whole listing contract depends on.
      const body = fs.readFileSync(legacyResume, "utf8").replace(/^#{1,6}\s+(Where it stands:)/m, "$1");
      fs.writeFileSync(path.join(runDir, RESUME_FILE), body);
      try { fs.unlinkSync(legacyResume); } catch (_) {}
      notes.push(`RESUME.md moved to ${path.relative(p.root, path.join(runDir, RESUME_FILE)).split(path.sep).join("/")} and its heading prefix stripped, so \`orc resume\` can finally see it.`);
    }
  }

  // Record the hashes now, so `document.md` starts life FRESH rather than stale.
  const sourceHashes = {};
  for (const entry of d.outline || []) {
    const src = docSectionSource(p, entry);
    if (!src.text) continue;
    const h = docHash(src.text);
    sourceHashes[entry.id] = h;
    const prev = d.sections[entry.id] || {};
    d.sections[entry.id] = { ...prev, source_hash: h, state: prev.state === "checked" ? "checked" : "written" };
  }
  if (fs.existsSync(p.document))
    d.compiled = { at: fmtStamp(new Date()), cycle: d.cycle || 0, partial: false, sections: Object.keys(sourceHashes), missing: [], source_hashes: sourceHashes };

  if (o.clean && p.work && fs.existsSync(p.work)) {
    try { fs.rmSync(p.work, { recursive: true, force: true }); notes.push(`${DOC_WORK}/ removed on your explicit request.`); } catch (_) {}
  }

  d.version = DOC_STATE_VERSION;
  d.migrations = Array.isArray(d.migrations) ? d.migrations : [];
  // NOT in the journal: `orc doc log` records what the USER said, and a
  // migration is a machine fact (hard rule 12).
  d.migrations.push({ from: 1, to: DOC_STATE_VERSION, at: fmtStamp(new Date()), sections, notes });
  docWrite(claudeDir, slug, d);
  return { refused: false, slug, from: 1, to: DOC_STATE_VERSION, sections, notes };
}

function docMigrateCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const d = slug ? docRead(claudeDir, slug) : null;
  if (!d) return docNoSuch(asJson, slugArg);
  const already = d.version >= DOC_STATE_VERSION;
  const res = docMigrateV2(claudeDir, slug, { clean: flag("--clean") });
  if (res && res.refused) {
    if (asJson) emitJson({ ok: false, reason: res.reason, slug, hint: res.hint }, 1);
    console.error("❌ " + res.hint);
    process.exit(1);
  }
  if (already || !res) {
    if (asJson) emitJson({ ok: true, slug, migrated: false, version: DOC_STATE_VERSION, hint: "already on v2 — nothing to do" }, 0);
    console.log(`${slug} is already on v${DOC_STATE_VERSION}. Nothing to do.`);
    process.exit(0);
  }
  if (asJson) emitJson({ ok: true, slug, migrated: true, ...res }, 0);
  console.log(ui.header(`ORC · doc migrate — ${slug}  v1 → v${DOC_STATE_VERSION}`));
  console.log(`\n  ${plural(res.sections.length, "section")} now live under sections/, which is the source of truth.`);
  for (const n of res.notes) console.log(`    · ${n}`);
  console.log(ui.color.gray(`\n  ${DOC_FILE} was NOT deleted. It is the build artifact — rebuild it any time with \`orc doc compile ${slug}\`.`));
  process.exit(0);
}

// ── write mode — asked once per run, stored, enforced by `orc doc next` ─────
// Never decided per wave by the skill: that is remembered-not-dispatched
// protocol, the failure this repo has already paid for twice.
function docModeCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const d = slug ? docRead(claudeDir, slug) : null;
  if (!d) return docNoSuch(asJson, slugArg);
  const set = docOpt("--set");
  if (set) {
    if (!DOC_WRITE_MODES.includes(set) || set === "ask") {
      const hint = `--set must be one of: ${DOC_WRITE_MODES.filter((m) => m !== "ask").join(", ")}`;
      if (asJson) emitJson({ ok: false, reason: "bad-mode", slug, hint }, 2);
      console.error("❌ " + hint);
      process.exit(2);
    }
    d.write_mode = set;
    docWrite(claudeDir, slug, d);
  }
  const cfg = resolvedConfig(claudeDir);
  const resolved = d.write_mode || (cfg.doc_write_mode === "ask" ? null : cfg.doc_write_mode);
  const payload = {
    ok: true,
    slug,
    write_mode: resolved,
    stored: d.write_mode || null,
    config_default: cfg.doc_write_mode,
    hint: resolved
      ? null
      : "unset — this is a decision, and it is asked once and stored. `partial` writes ONE wave so you can read it before the rest is paid for.",
  };
  if (asJson) emitJson(payload, 0);
  console.log(`write mode for ${slug}: ${resolved || "unset (ask)"}`);
  if (!resolved) console.log(ui.color.gray("  " + payload.hint));
  process.exit(0);
}

// ── gaps.md — DERIVED, CLI-written, never compiled in ───────────────────────
// This is where an Open question and an Assumption go now. The deliverable
// carries content only; ORC's uncertainty about it is real and is written down,
// just not inside the document the reader came for.
function docWriteGaps(claudeDir, slug, d) {
  const p = docPaths(claudeDir, slug);
  const rows = (d.journal || []).filter((e) => e.kind === "gap");
  if (!rows.length) {
    try { if (fs.existsSync(p.gaps)) fs.unlinkSync(p.gaps); } catch (_) {}
    return null;
  }
  const L = [
    "<!-- orc-doc:derived — written by the `orc doc` CLI from doc.json.",
    "     Record one with `orc doc log <slug> --kind gap --sections <id> --text \"…\"`. -->",
    "",
    `# Gaps — ${d.title}`,
    "",
    "Everything ORC could not anchor to the frozen context. It is NOT in the",
    "document: the deliverable carries content only.",
    "",
    "| # | Section | Kind | What is missing |",
    "|---|---|---|---|",
    ...rows.map((e, i) => `| ${i + 1} | ${(e.sections || []).join(", ") || "—"} | ${e.source === "assumption" ? "assumption" : "open"} | ${String(e.text).replace(/\|/g, "\\|").split("\n")[0]} |`),
    "",
  ];
  fs.writeFileSync(p.gaps, L.join("\n"));
  return p.gaps;
}

function docLintCmd(claudeDir, arg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, arg);
  let file = null;
  let target = docOpt("--target");
  if (slug) {
    const p = docPaths(claudeDir, slug);
    const d = docRead(claudeDir, slug);
    file = p.document;
    if (!target) target = d.target;
  } else if (arg) {
    file = path.isAbsolute(arg) ? arg : path.join(repoRootOf(claudeDir), arg);
  }
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const hint = `cannot read: ${arg || "(no slug or path given)"}`;
    if (asJson) emitJson({ ok: false, reason: "no-document", path: arg || null, hint }, 2);
    console.error("❌ " + hint);
    process.exit(2);
  }
  const res = docLintRun(fs.readFileSync(file, "utf8"), target);
  const payload = { ok: true, slug: slug || null, file: file.split(path.sep).join("/"), ...res };
  const code = res.findings.length ? 1 : 0;
  if (asJson) emitJson(payload, code);
  console.log(ui.header(`orc doc lint — ${path.basename(file)}  →  ${res.target_label}`));
  console.log(
    `\n  ${res.errors} errors · ${res.warnings} warnings · ${res.lines} lines\n` +
      `  readability: avg ${res.readability.avg_sentence_words} words/sentence (bar ${res.readability.avg_bar}) · ` +
      `longest ${res.readability.longest_sentence_words} → L${res.readability.longest_sentence_line} · ` +
      `${res.readability.passive_constructions} passive · ${res.readability.undefined_acronyms.length} undefined acronyms\n`
  );
  for (const f of res.findings.slice(0, 60))
    console.log(`  ${f.id}  ${f.severity.padEnd(5)} ${String(f.line).padStart(5)}  ${f.what}`);
  if (res.findings.length > 60) console.log(`  … and ${res.findings.length - 60} more (use --json for all of them)`);
  if (res.import_note) console.log(ui.color.gray(`\n  ${res.target_label}: ${res.import_note}`));
  console.log(ui.color.gray("\n  " + res.honesty[0] + "\n  " + res.honesty[1]));
  process.exit(code);
}

function docStatusCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  if (slug) docMigrateV2(claudeDir, slug);
  const view = slug ? docMapView(claudeDir, slug) : null;
  if (!view) return docNoSuch(asJson, slugArg);
  const d = view.d;
  const p = view.paths;
  const v2 = d.version >= DOC_STATE_VERSION;
  const pv = docPartsView(claudeDir, slug);
  const hasDoc = !!view.document && fs.existsSync(view.document);
  const lint = hasDoc ? docLintRun(fs.readFileSync(view.document, "utf8"), d.target) : null;
  const byId = new Map((v2 ? pv.rows : view.sections).map((s) => [s.id, s]));
  const open = d.outline.filter((o) => {
    const s = byId.get(o.id);
    return o.required && (!s || s.state === "planned" || s.state === "open" || s.state === "unconfirmed");
  });
  const userEdited = (v2 ? pv.rows : view.sections).filter((s) => s.state === "user-edited");
  const staleDoc = v2 && hasDoc ? docDocStale(pv) : null;
  const state = docComputedState(d, view, { hasDoc, open, lint, pv: v2 ? pv : null, staleDoc });
  const drift = docShipDrift(d, view);
  const next = docNextAction(claudeDir, slug);
  const wave = docWaveState(d, pv.rows);
  const payload = {
    ok: true,
    slug,
    title: d.title,
    type: d.type,
    target: d.target,
    language: d.language,
    version: d.version,
    cycle: d.cycle || 0,
    state,
    write_mode: d.write_mode || null,
    wave,
    shipped: d.shipped || null,
    drifted_sections: state === "shipped-drifted" ? drift : [],
    next: next ? { phase: next.phase, action: next.action, command: next.command, paid: next.paid, blocked_by: next.blocked_by } : null,
    document: hasDoc ? path.relative(p.root, view.document).split(path.sep).join("/") : null,
    document_stale: staleDoc && staleDoc.length ? staleDoc : [],
    sections_dir: path.relative(p.root, p.sections).split(path.sep).join("/"),
    lines: view.total_lines,
    sections_total: d.outline.length,
    sections_written: (v2 ? pv.rows : view.sections).filter((s) => (v2 ? s.state === "written" || s.state === "checked" : s.state !== "planned" && s.state !== "open")).length,
    open_sections: open.map((o) => ({ id: o.id, heading: o.heading })),
    user_edited: userEdited.map((s) => ({ id: s.id, heading: s.heading })),
    lint: lint ? { errors: lint.errors, warnings: lint.warnings, target: lint.target } : null,
    dir: p.folder,
    // ONE GENERATOR, NOT TWO. The skill copies this line VERBATIM into
    // RESUME.md, so the CLI computes and the skill renders — and the two can no
    // longer disagree about what the run's own status line says.
    where: docWhereLine(d, view, { rows: v2 ? pv.rows : null, phase: next ? next.phase : null, wave }),
    resume: `/orc-doc resume ${slug}`,
  };
  // 1 = THERE IS SOMETHING TO DO. `shipped-drifted` is a 1 for that reason: the
  // document moved after it was delivered, so either re-ship it or say why not.
  const code = DOC_STATE_EXIT[state];
  if (asJson) emitJson(payload, code);
  console.log(ui.header(`ORC · doc status — ${slug}`));
  console.log(`\n  ${state}`);
  console.log(`  ${payload.where}`);
  if (staleDoc && staleDoc.length)
    console.log(
      `  ${DOC_FILE} is behind sections/: ${staleDoc.map((s) => s.heading).join(", ")}  ${ui.color.gray("(free to rebuild — orc doc compile)")}`
    );
  if (lint) console.log(`  lint: ${lint.errors} errors, ${lint.warnings} warnings against ${lint.target_label}`);
  if (userEdited.length)
    console.log(`\n  You edited since last time: ${userEdited.map((s) => s.heading).join(", ")}\n  ${ui.color.gray("These are never rewritten unless you name them.")}`);
  if (open.length) console.log(`  Still open: ${open.map((o) => o.heading).join(" · ")}`);
  if (state === "shipped-drifted")
    console.log(
      `\n  Changed since it shipped: ${drift.map((s) => s.heading).join(", ")}\n  ` +
        ui.color.gray("Coverage-relative on purpose — a whole-file \"something changed\" cannot tell you what to re-read.")
    );
  if (next) console.log(`\n  Next:  ${next.command || ui.color.yellow("waiting on you — " + next.blocked_by)}`);
  console.log(`\n  Carry on, even in a brand-new chat:  ${payload.resume}`);
  process.exit(code);
}

// ── ship: RECORDED as a decision, COMPUTED as a state (v0.48.1) ─────────────
// Two rules this repo already uses for exactly this shape:
//   1. /orc-pact — "retirement is a user decision with a recorded reason", so
//      shipping is RECORDED and never inferred from "it looks finished".
//   2. /orc-challenge — "PASS is computed, never declared", so the resulting
//      STATE is derived from the record every time it is read, never stored.
//
// Before this, `docStatusCmd` computed `complete` and stopped there. Nothing
// recorded that a document was DELIVERED, so a listing could not tell a PRD
// that went to a backend team in March from one that has been sitting finished
// and forgotten ever since.

const docWholeHash = (view) => (view && view.document && fs.existsSync(view.document) ? docHash(fs.readFileSync(view.document, "utf8")) : null);

function docSectionHashes(view) {
  const out = {};
  for (const s of (view && view.sections) || []) out[s.id] = s.hash;
  return out;
}

// Which sections moved SINCE THE SHIP — coverage-relative, the
// `computeWikiFreshness` lesson applied to a document. A whole-file "something
// changed" would be useless: it cannot tell you what to re-read.
function docShipDrift(d, view) {
  const rec = d && d.shipped;
  if (!rec) return null;
  const then = rec.section_hashes || {};
  const now = docSectionHashes(view);
  const out = [];
  for (const s of (view && view.sections) || [])
    if (then[s.id] && then[s.id] !== now[s.id]) out.push({ id: s.id, heading: s.heading, reason: "changed" });
  for (const id of Object.keys(then)) if (!(id in now)) out.push({ id, heading: id, reason: "gone" });
  for (const s of (view && view.sections) || []) if (!(s.id in then)) out.push({ id: s.id, heading: s.heading, reason: "added" });
  return out;
}

// not-started | in-progress | complete | shipped | shipped-drifted.
// `shipped-drifted` KEEPS ITS SLOT and is an answer, not a gap.
function docComputedState(d, view, { hasDoc, open, lint, pv, staleDoc }) {
  // v2: the SECTION FILES are the progress, so a document with sections written
  // and no compile yet is `in-progress`, never `not-started`. A build artifact
  // that has not been built yet says nothing about whether work happened.
  if (pv) {
    const anyWritten = pv.rows.some((r) => r.exists);
    if (!hasDoc && !anyWritten) return "not-started";
  } else if (!hasDoc) return "not-started";
  const finished = hasDoc && !open.length && lint && lint.errors === 0 && !(staleDoc && staleDoc.length);
  if (d.shipped) {
    const drift = docShipDrift(d, view);
    return drift && drift.length ? "shipped-drifted" : "shipped";
  }
  return finished ? "complete" : "in-progress";
}

// `1` means THERE IS SOMETHING TO DO, and that is now said out loud in the help
// text. `shipped-drifted` is a 1 for that reason: the document moved after it
// was delivered, so either re-ship it or say why not — either way, work.
const DOC_STATE_EXIT = { "not-started": 1, "in-progress": 1, complete: 0, shipped: 0, "shipped-drifted": 1 };

function docShipCmd(claudeDir, slugArg, undo) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const view = slug ? docMapView(claudeDir, slug) : null;
  if (!view) return docNoSuch(asJson, slugArg);
  const d = view.d;
  const fail = (reason, hint, extra, code = 2) => {
    if (asJson) emitJson({ ok: false, reason, slug, hint, ...(extra || {}) }, code);
    console.error("❌ " + hint);
    process.exit(code);
  };

  if (undo) {
    // Unship needs a reason for the same rule ship needs a destination: an
    // undone decision with no recorded why is a decision nobody can review.
    const reason = docOpt("--reason");
    if (!reason) fail("no-reason", "orc doc unship needs --reason <text> — an un-shipped document with no reason is a state nobody can explain.");
    if (!d.shipped) fail("not-shipped", `${slug} was never shipped, so there is nothing to undo.`, null, 1);
    d.ship_history = Array.isArray(d.ship_history) ? d.ship_history : [];
    d.ship_history.push({ ...d.shipped, unshipped_at: fmtStamp(new Date()), unship_reason: reason });
    d.shipped = null;
    docWrite(claudeDir, slug, d);
    if (asJson) emitJson({ ok: true, slug, state: "in-progress", ship_history: d.ship_history.length, reason }, 0);
    console.log(ui.header(`ORC · doc unship — ${slug}`));
    console.log(`\n  Un-shipped. The previous record is kept in ship_history (${d.ship_history.length} now) — nothing is ever silently erased.`);
    console.log(`  Reason: ${reason}`);
    process.exit(0);
  }

  // `--where` has NO DEFAULT, the `orc challenge init --goal` rule: "shipped"
  // with no destination is not a fact, it is a feeling.
  const where = docOpt("--where");
  if (!where)
    fail(
      "no-where",
      "orc doc ship needs --where <destination> — a Notion URL, a Slack thread, " +
        '"handed to the platform team in the 12 Aug review". Shipped with no destination is not a fact.'
    );

  const hasDoc = !!view.document && fs.existsSync(view.document);
  const lint = hasDoc ? docLintRun(fs.readFileSync(view.document, "utf8"), d.target) : null;
  const v2 = d.version >= DOC_STATE_VERSION;
  const pv = v2 ? docPartsView(claudeDir, slug) : null;
  const byId = new Map((v2 ? pv.rows : view.sections).map((s) => [s.id, s]));
  const open = d.outline.filter((o) => {
    const s = byId.get(o.id);
    return o.required && (!s || s.state === "planned" || s.state === "open" || s.state === "unconfirmed");
  });
  // A document.md behind its own sections/ is not the document that would be
  // delivered. Same wording family as `shipped-drifted`, one step earlier.
  const staleDoc = v2 && hasDoc ? docDocStale(pv) : null;
  if (staleDoc && staleDoc.length)
    fail(
      "document-stale",
      `${DOC_FILE} is behind sections/: ${staleDoc.map((s) => s.heading).join(", ")} changed since the last compile. ` +
        `Rebuild it first (free): orc doc compile ${slug}`,
      { stale_sections: staleDoc },
      1
    );
  const complete = hasDoc && !open.length && lint && lint.errors === 0;
  const forced = flag("--force");
  const forceReason = docOpt("--reason");

  if (!complete && !forced)
    fail(
      "not-complete",
      `${slug} is not complete: ` +
        (open.length ? `${plural(open.length, "required section")} still open (${open.map((o) => o.heading).join(", ")})` : "") +
        (open.length && lint && lint.errors ? "; " : "") +
        (lint && lint.errors ? `${plural(lint.errors, "lint error")}` : "") +
        ". Ship it anyway with --force --reason <text>.",
      { open_sections: open.map((o) => ({ id: o.id, heading: o.heading })), lint_errors: lint ? lint.errors : null },
      1
    );
  // The escape valve is never automatic and never silent.
  if (!complete && forced && !forceReason)
    fail("no-force-reason", "--force needs --reason <text>: shipping an incomplete document is a decision, and it is recorded verbatim.");

  d.shipped = {
    at: fmtStamp(new Date()),
    where,
    note: docOpt("--note") || null,
    cycle: d.cycle || 0,
    lines: view.total_lines,
    document_hash: docWholeHash(view),
    section_hashes: docSectionHashes(view),
    source_commit: gitIn(view.paths.root, ["rev-parse", "--short", "HEAD"]) || null,
    forced: !complete,
    force_reason: !complete ? forceReason : null,
  };
  docWrite(claudeDir, slug, d);

  if (asJson) emitJson({ ok: true, slug, state: "shipped", shipped: d.shipped, where: docWhereLine(d, view) }, 0);
  console.log(ui.header(`ORC · doc ship — ${slug}`));
  console.log(`\n  Shipped ${d.shipped.at} → ${where}`);
  if (d.shipped.note) console.log(`  Note: ${d.shipped.note}`);
  if (d.shipped.forced) console.log(ui.color.yellow(`  FORCED (incomplete): ${forceReason}`));
  console.log(ui.color.gray(`\n  ${view.sections.length} section hashes recorded. If any of them changes, this reads shipped-drifted —`));
  console.log(ui.color.gray("  which names the sections that moved, so you know exactly what a re-send would change."));
  process.exit(0);
}

// ── the audit — every drift class, from disk (v0.48.1) ──────────────────────
// Each finding carries a `fix` command and a `panel` (the FINDING_ROUTE rule: a
// caution routes to the panel that can CLEAR it; `panel: null` when there is
// genuinely no button).
//
// `user-edited` sections are REPORTED and never counted as a finding. Rule 4
// says a human's wording is not recoverable from this lane's side, and flagging
// their edits as drift would teach people to stop editing their own document.
function docAuditFindings(claudeDir, slug) {
  const view = docMapView(claudeDir, slug);
  if (!view) return null;
  const d = view.d;
  const p = view.paths;
  const out = [];
  const add = (id, summary, fix, panel, level = "error") => out.push({ id, level, summary, fix, panel });
  const hasDoc = !!view.document && fs.existsSync(view.document);
  const v2 = d.version >= DOC_STATE_VERSION;

  // ── v0.49.0 — the folder's own drift classes ──────────────────────────────
  if (v2) {
    const pv = docPartsView(claudeDir, slug);
    for (const r of pv.rows) {
      if (r.required && !r.exists)
        add("part-missing", `"${r.heading}" is required and has no source file under sections/.`, `orc doc plan ${slug} --role write --only ${r.id} --json`, "docs");
      if (r.state === "unconfirmed")
        add(
          "part-unconfirmed",
          `${r.files[0]} exists but no validated return ever recorded its hash — a wave killed mid-flight leaves exactly this.`,
          `orc doc plan ${slug} --role write --only ${r.id} --json`,
          "docs"
        );
      if (!r.ordinal_ok)
        add("part-misnumbered", `${r.id} no longer mirrors its outline position.`, `orc doc outline ${slug} --set ${DOC_OUTLINE_FILE}`, "docs", "warn");
      for (const pb of r.problems) add("subpart-bad-level", pb.what, `orc doc parts ${slug} --json`, "docs");
    }
    // A file under sections/ that no outline entry claims.
    if (pv.paths.sections && fs.existsSync(pv.paths.sections)) {
      const claimed = new Set(pv.rows.map((r) => r.id));
      for (const e of fs.readdirSync(pv.paths.sections, { withFileTypes: true })) {
        const id = e.name.replace(/\.md$/, "");
        if (id === DOC_FRONT_FILE.replace(/\.md$/, "") || claimed.has(id)) continue;
        add("part-orphan", `sections/${e.name} is not in the outline — nothing will ever compile it.`, `orc doc outline ${slug} --json`, "docs", "warn");
      }
    }
    const staleDoc = hasDoc ? docDocStale(pv) : null;
    if (staleDoc && staleDoc.length)
      add(
        "document-stale",
        `${DOC_FILE} is behind sections/: ${staleDoc.map((s) => s.heading).join(", ")}.`,
        `orc doc compile ${slug}`,
        "docs",
        "warn"
      );
    if (p.work && fs.existsSync(p.work) && fs.readdirSync(p.work).length)
      add("legacy-work", `${DOC_WORK}/ still holds files from before this document became a folder. Nothing reads them.`, `orc doc migrate ${slug} --clean`, "docs", "warn");
    if (p.folder && fs.existsSync(path.join(p.folder, RESUME_FILE)))
      add(
        "resume-misplaced",
        `RESUME.md is in the document folder, where \`orc resume\` and \`orc run list\` never look.`,
        `orc doc migrate ${slug}`,
        "docs"
      );
  } else {
    add("doc-v1", `${slug} is still v1: one file, and every change routed through it.`, `orc doc migrate ${slug}`, "docs", "warn");
  }

  if (hasDoc) {
    const ann = docAnnotations(fs.readFileSync(view.document, "utf8"));
    if (ann.length)
      add(
        "annotation-in-body",
        `${plural(ann.length, "line")} of ORC bookkeeping in the deliverable (first at line ${ann[0].line}). The document carries content only.`,
        `orc doc compile ${slug} --strip-annotations`,
        "docs"
      );
  }

  // Extracts that never came back, and extracts whose section moved under them.
  const now = docSectionHashes(view);
  for (const [id, rec] of Object.entries(d.extracts || {})) {
    const part = p.work ? path.join(p.work, id + ".md") : null;
    if (!part || !fs.existsSync(part)) continue;
    let age = "";
    try {
      age = " (" + relAgeShort(Date.now() - fs.statSync(part).mtimeMs) + " old)";
    } catch (_) {}
    if (rec && rec.hash && now[id] && rec.hash !== now[id])
      add(
        "extract-stale",
        `.work/${id}.md was extracted from a version of "${id}" that no longer matches the document — splice WILL refuse.`,
        `orc doc extract ${slug} --section ${id}`,
        "docs"
      );
    else add("orphan-extract", `.work/${id}.md was extracted${age} and never spliced back.`, `orc doc splice ${slug}`, "docs", "warn");
  }

  // The outline and the document disagreeing is always a hand edit, and always
  // worth naming: every later batch is computed from the outline.
  if (hasDoc) {
    const live = new Set(view.sections.map((s) => s.id));
    // A section that was never WRITTEN did not vanish — it is `part-missing`,
    // reported above. Claiming both would be the audit saying something the disk
    // does not prove, and under `compile --partial` it would say it eight times.
    const written = v2 ? new Set(docPartsView(claudeDir, slug).rows.filter((r) => r.exists).map((r) => r.id)) : null;
    for (const o of d.outline || [])
      if (!live.has(o.id) && (!written || written.has(o.id)))
        add("section-vanished", `outline lists "${o.heading}" but the document has no such heading.`, `orc doc compile ${slug}`, "docs");
    const planned = new Set((d.outline || []).map((o) => o.id));
    for (const s of view.sections)
      if (!planned.has(s.id))
        add("section-unlisted", `the document has "${s.heading}" but the outline does not.`, `orc doc outline ${slug}`, "docs", "warn");

    // The target decides the portability rules the lint enforces, so a target
    // that disagrees with the file is a lint measuring the wrong thing.
    const tgt = docTarget(d.target);
    const text = fs.readFileSync(view.document, "utf8");
    const hasFront = /^---\r?\n/.test(text);
    if (tgt && tgt.front_matter === "required" && !hasFront)
      add("target-mismatch", `target ${tgt.label} requires front matter and the document has none.`, `orc doc lint ${slug}`, "docs");
    if (tgt && tgt.front_matter === "banned" && hasFront)
      add("target-mismatch", `target ${tgt.label} does not support front matter, and the document starts with some.`, `orc doc lint ${slug}`, "docs");
    const tooDeep = view.sections.filter((s) => s.level > Number(tgt && tgt.max_heading ? tgt.max_heading : 6));
    if (tooDeep.length)
      add(
        "target-mismatch",
        `${plural(tooDeep.length, "heading")} deeper than H${tgt.max_heading}, which ${tgt.label} flattens.`,
        `orc doc lint ${slug}`,
        "docs"
      );
  }

  const drift = docShipDrift(d, view);
  if (drift && drift.length)
    add(
      "ship-drifted",
      `shipped ${d.shipped.at} to ${d.shipped.where}, and ${plural(drift.length, "section")} changed since: ` +
        drift.map((s) => s.heading).join(", ") + ".",
      `orc doc ship ${slug} --where "<where it went this time>"`,
      "docs",
      "warn"
    );

  // Hard rule 10: nothing is created before D1 is answered — so a doc.json with
  // no context.md is a document that was started without a frozen brief.
  const ctx = docContextPaths(p);
  if (!fs.existsSync(ctx.context))
    add("context-missing", "doc.json exists but context.md does not — this document has no frozen brief.", `/orc-doc resume ${slug}`, null);
  else {
    // docContextSources, not docContextRead: only the former resolves each
    // reference file against disk and sets its state.
    const src = docContextSources(ctx, p.root);
    // A WARNING, never an error. A frozen context is SUPPOSED to be old; what
    // is not acceptable is nobody knowing a source moved under it.
    const moved = (src.sources || []).filter((s) => s.state === "MISSING" || s.state === "SOURCE-DRIFTED");
    if (moved.length)
      add(
        "source-drifted",
        `${plural(moved.length, "reference file")} moved since the brief was frozen: ` + moved.map((s) => `${s.path} (${s.state})`).join(", "),
        `orc doc context ${slug}`,
        "docs",
        "warn"
      );
    const behind = docContextCommitsBehind(p.root, src.source_commit);
    if (behind !== null && behind > 200)
      add(
        "context-behind",
        `the brief was frozen ${plural(behind, "commit")} ago. That is not wrong — a frozen context is meant to be old — but it is worth a look.`,
        `orc doc context ${slug}`,
        "docs",
        "warn"
      );
  }

  if ((d.cycle || 0) !== (d.cycles || []).length)
    add(
      "cycle-mismatch",
      `doc.json says cycle ${d.cycle || 0} but records ${plural((d.cycles || []).length, "cycle")}.`,
      `orc doc show ${slug} --json`,
      null,
      "warn"
    );

  return { view, findings: out, user_edited: view.sections.filter((s) => s.state === "user-edited").map((s) => ({ id: s.id, heading: s.heading })) };
}

function docAuditCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const res = slug ? docAuditFindings(claudeDir, slug) : null;
  if (!res) return docNoSuch(asJson, slugArg);
  const code = res.findings.length ? 1 : 0;
  if (asJson) emitJson({ ok: true, slug, clean: !res.findings.length, findings: res.findings, user_edited: res.user_edited }, code);
  console.log(ui.header(`ORC · doc audit — ${slug}`));
  if (!res.findings.length) console.log("\n  Nothing drifted.");
  for (const f of res.findings) {
    console.log(`\n  ${(f.level === "error" ? ui.color.red("✗") : ui.color.yellow("~"))} ${f.id}`);
    console.log(`    ${f.summary}`);
    console.log(`    fix: ${f.fix}`);
  }
  if (res.user_edited.length)
    console.log(
      ui.color.gray(`\n  You edited: ${res.user_edited.map((s) => s.heading).join(", ")}\n` + "  Reported, never a finding — your wording is not recoverable from this side.")
    );
  process.exit(code);
}

// ── the memory surface (v0.48.1) ────────────────────────────────────────────
// A DATA gap, not a rendering one. Measured on disk before this release:
// `created_at` existed and `orc doc show --json` never emitted it; `context.md`
// and `context-sources.md` were files the CLI never opened; and what the user
// ASKED FOR, in order, across every session, lived nowhere at all.
//
// No conflict with hard rule 0. Rule 0 forbids the orchestrator reading
// `document.md`. `context.md` and `outline.md` are exactly what a resumed
// session is INSTRUCTED to read.

// How many separate sessions have touched this document — counted from the
// trace files the hook already writes, never from a counter a model maintains.
function docSessionCount(claudeDir, slug) {
  try {
    const dir = resolveLogDir(claudeDir);
    if (!fs.existsSync(dir)) return 0;
    const base = String(slug).replace(/-\d{6}$/, "");
    return fs.readdirSync(dir).filter((f) => f.startsWith("run-doc-") && f.includes(base) && f.endsWith(".txt")).length;
  } catch (_) {
    return 0;
  }
}

const DOC_CONTEXT_FILE = "context.md";
const DOC_SOURCES_FILE = "context-sources.md";
const DOC_CHANGELOG_FILE = "changelog.md";
// `gap` (v0.49.0) is where an Open question or an Assumption goes now that the
// deliverable carries content only. It is NOT a second ledger: it rides the
// journal, which already has exactly one writer, and gaps.md is derived from it.
const DOC_JOURNAL_KINDS = ["request", "decision", "gate", "note", "gap"];

function docContextPaths(p) {
  return {
    context: p.folder ? path.join(p.folder, DOC_CONTEXT_FILE) : null,
    sources: p.folder ? path.join(p.folder, DOC_SOURCES_FILE) : null,
    changelog: p.folder ? path.join(p.folder, DOC_CHANGELOG_FILE) : null,
  };
}

function docContextCommitsBehind(root, commit) {
  if (!commit) return null;
  const out = gitIn(root, ["rev-list", "--count", `${commit}..HEAD`]);
  return out === null ? null : Number(out) || 0;
}

// Parse the frozen brief. The VERBATIM REQUEST comes first because that is the
// memory-regain payload — everything else is supporting detail.
function docContextRead(ctx, root) {
  if (!ctx.context || !fs.existsSync(ctx.context)) return { exists: false, sources: [] };
  const text = fs.readFileSync(ctx.context, "utf8");
  const frozen = (text.match(/<!--\s*frozen\s+([^·\n]+?)\s*(?:·|-->)/) || [])[1] || null;
  // NO `m` FLAG on the terminator. Under `m`, `$` matches end of LINE, so a
  // lazy body stops at the first newline and every multi-line block came back
  // as its first line only — which read as "the brief has one bullet" rather
  // than as a parser bug.
  const block = (title) => {
    const re = new RegExp("(?:^|\\n)##\\s+" + title + "[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$(?![\\s\\S]))");
    const m = re.exec(text);
    return m ? m[1].trim() : null;
  };
  const request = block("The request \\(verbatim\\)") || block("The request");
  const sources = [];
  const table = block("Supporting documents[^\\n]*") || "";
  for (const line of table.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4 || /^-+$/.test(cells[1]) || /^path$/i.test(cells[1])) continue;
    const rel = cells[1];
    if (!rel || /^\*?none\*?$/i.test(rel)) continue;
    sources.push({ path: rel, read: /^y/i.test(cells[2] || ""), digest: cells[3] || null });
  }
  return {
    exists: true,
    path: ctx.context,
    frozen_at: frozen,
    request: request ? request.replace(/^>\s?/gm, "").trim() : null,
    purpose: block("Purpose[^\\n]*"),
    template: block("Template[^\\n]*"),
    decisions: block("Decisions[^\\n]*"),
    sources,
    source_commit: (text.match(/source_commit:\s*([0-9a-f]{7,40})/) || [])[1] || null,
  };
}

// Does each D2 reference file still exist, and has it changed since the freeze?
// Coverage-relative, the `computeWikiFreshness` shape applied to a brief: a
// supporting document is stale only when THAT FILE moved, never because the
// repository did.
function docContextSources(ctx, root) {
  const parsed = docContextRead(ctx, root);
  if (!parsed.exists) return parsed;
  const recorded = {};
  if (ctx.sources && fs.existsSync(ctx.sources)) {
    const s = fs.readFileSync(ctx.sources, "utf8");
    for (const m of s.matchAll(/^<!--\s*source:\s*(\S+)\s+sha:\s*([0-9a-f]+)\s*-->/gm)) recorded[m[1]] = m[2];
  }
  parsed.sources = parsed.sources.map((row) => {
    const abs = path.isAbsolute(row.path) ? row.path : path.join(root, ...row.path.split(/[\\/]/));
    if (!fs.existsSync(abs)) return { ...row, state: "MISSING", note: "the file the brief was built on is gone" };
    const known = recorded[row.path];
    if (!known) return { ...row, state: "ok", note: "no hash was recorded at freeze time — existence is all that can be checked" };
    const live = docHash(fs.readFileSync(abs, "utf8"));
    return live === known
      ? { ...row, state: "ok" }
      : { ...row, state: "SOURCE-DRIFTED", note: "changed since the brief was frozen — the brief is not wrong, but it is older than this file" };
  });
  parsed.sources_path = ctx.sources && fs.existsSync(ctx.sources) ? ctx.sources : null;
  return parsed;
}

function docContextCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const d = slug ? docRead(claudeDir, slug) : null;
  if (!d) return docNoSuch(asJson, slugArg);
  const p = docPaths(claudeDir, slug);
  const ctx = docContextSources(docContextPaths(p), p.root);
  const drifted = (ctx.sources || []).filter((s) => s.state !== "ok");
  const code = drifted.length ? 1 : 0;
  if (asJson) emitJson({ ok: true, slug, context: ctx, drifted: drifted.map((s) => s.path) }, code);

  console.log(ui.header(`ORC · doc context — ${slug}`));
  if (!ctx.exists) {
    console.log("\n  No context.md. This document was started without a frozen brief.");
    process.exit(code);
  }
  console.log(ui.color.gray(`\n  Frozen ${ctx.frozen_at || "(date not recorded)"} — read forever, never re-asked.`));
  if (ctx.request) console.log(`\n  YOU ASKED FOR:\n${ctx.request.split("\n").map((l) => "    " + l).join("\n")}`);
  if (ctx.purpose) console.log(`\n  Purpose\n${ctx.purpose.split("\n").map((l) => "    " + l).join("\n")}`);
  if (!ctx.sources.length) console.log(ui.color.gray("\n  Reference files: none — you were asked and said none."));
  else {
    console.log("\n  Reference files");
    for (const s of ctx.sources) console.log(`    ${s.state.padEnd(16)} ${s.path}${s.note ? "  " + ui.color.gray(s.note) : ""}`);
  }
  process.exit(code);
}

// ── the journal — one writer, and it NEVER invents an entry ─────────────────
function docLogCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const d = slug ? docRead(claudeDir, slug) : null;
  if (!d) return docNoSuch(asJson, slugArg);
  const fail = (reason, hint) => {
    if (asJson) emitJson({ ok: false, reason, slug, hint }, 2);
    console.error("❌ " + hint);
    process.exit(2);
  };
  const kind = String(docOpt("--kind") || "").toLowerCase();
  if (!DOC_JOURNAL_KINDS.includes(kind)) fail("bad-kind", `--kind must be one of: ${DOC_JOURNAL_KINDS.join(", ")}`);
  const text = docOpt("--text");
  if (!text) fail("no-text", "orc doc log needs --text — and at D1 it is the user's words VERBATIM, never a paraphrase.");

  d.journal = Array.isArray(d.journal) ? d.journal : [];
  const entry = {
    n: d.journal.length + 1,
    at: fmtStamp(new Date()),
    kind,
    text,
    cycle: d.cycle || 0,
    sections: String(docOpt("--sections") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    source: docOpt("--source") || "user",
  };
  d.journal.push(entry);
  // Through docWrite, so doc.json still has EXACTLY ONE WRITER.
  docWrite(claudeDir, slug, d);
  const gaps = docWriteGaps(claudeDir, slug, d);
  if (asJson) emitJson({ ok: true, slug, entry, entries: d.journal.length, gaps: gaps ? path.basename(gaps) : null }, 0);
  console.log(`recorded #${entry.n} (${kind}) — ${d.journal.length} entries in the journal for ${slug}`);
  process.exit(0);
}

// Merge four sources into ONE chronological array. Every row carries its
// PROVENANCE so the panel can be honest about which is which:
//   recorded  the user's own words, verbatim (journal[])
//   derived   a machine fact (a cycle, a ship record)
//   observed  a machine fact with no text (a section that turned user-edited)
//
// AND IT NEVER INVENTS AN ENTRY. A cycle that ran with nothing logged renders
// as an explicit gap — never a plausible reconstruction from file mtimes. Same
// honesty rule as /orc-pact's UNCHECKABLE: not knowing is an answer, and faking
// it teaches people to distrust the rows that are real.
function docJournalRows(claudeDir, slug) {
  const view = docMapView(claudeDir, slug);
  if (!view) return null;
  const d = view.d;
  const rows = [];
  for (const e of d.journal || [])
    rows.push({ at: e.at, origin: "recorded", kind: e.kind, text: e.text, cycle: e.cycle || 0, sections: e.sections || [], source: e.source || "user" });

  const logged = new Set((d.journal || []).map((e) => e.cycle));
  (d.cycles || []).forEach((c, i) => {
    const n = c.n || i + 1;
    rows.push({
      at: c.at || null,
      origin: "derived",
      kind: c.role ? c.role + " cycle" : "cycle",
      text: null,
      cycle: n,
      sections: c.sections || [],
      agents: c.agents || null,
      gap: !logged.has(n),
    });
  });

  if (d.shipped) rows.push({ at: d.shipped.at, origin: "derived", kind: "shipped", text: d.shipped.where, cycle: d.shipped.cycle || 0, sections: [] });
  for (const h of d.ship_history || [])
    rows.push({ at: h.unshipped_at, origin: "derived", kind: "unshipped", text: h.unship_reason || null, cycle: h.cycle || 0, sections: [] });

  for (const s of view.sections)
    if (s.state === "user-edited") rows.push({ at: null, origin: "observed", kind: "you edited", text: null, cycle: s.cycle || 0, sections: [s.id] });

  // Oldest first: reading order IS the story.
  rows.sort((a, b) => (a.cycle || 0) - (b.cycle || 0) || String(a.at || "").localeCompare(String(b.at || "")));
  return { view, rows };
}

function docJournalCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const res = slug ? docJournalRows(claudeDir, slug) : null;
  if (!res) return docNoSuch(asJson, slugArg);
  const recorded = res.rows.filter((r) => r.origin === "recorded").length;
  const gaps = res.rows.filter((r) => r.gap).length;
  if (asJson) emitJson({ ok: true, slug, entries: res.rows.length, recorded, gaps, journal: res.rows }, 0);
  console.log(ui.header(`ORC · doc journal — ${slug}`));
  console.log(ui.color.gray(`\n  ${plural(res.rows.length, "entry", "entries")}, ${recorded} in your own words. Oldest first.\n`));
  for (const r of res.rows) {
    const mark = r.origin === "recorded" ? "•" : r.origin === "observed" ? "~" : "·";
    const head = `  ${mark} ${(r.at || "—").padEnd(20)} ${r.kind}`;
    if (r.gap) console.log(head + ui.color.gray("  · no request was recorded for it"));
    else console.log(head + (r.text ? "  " + r.text.split("\n")[0].slice(0, 96) : ""));
  }
  if (gaps)
    console.log(
      ui.color.gray(`\n  ${plural(gaps, "cycle")} ran with nothing recorded. Shown as a gap on purpose — a reconstruction would read like a fact.`)
    );
  process.exit(0);
}

// ── the reader — for the HUMAN, never for the orchestrator ──────────────────
// This does NOT weaken hard rule 0. `SKILL.md`'s rule table carries the line
// "the orchestrator never runs `orc doc read`", registered as a contract token
// so it cannot quietly disappear. It is a command for the person, the same way
// `orc challenge report` is.
function docReadCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const view = slug ? docMapView(claudeDir, slug) : null;
  if (!view) return docNoSuch(asJson, slugArg);
  const want0 = docOpt("--section");
  // v2: a named section is read straight from its own file, so `read` works
  // BEFORE a single compile has ever run.
  if (want0 && view.d.version >= DOC_STATE_VERSION && !flag("--toc")) {
    const entry = (view.d.outline || []).find((x) => x.id === want0 || x.id.startsWith(want0));
    const src = entry ? docSectionSource(view.paths, entry) : null;
    if (entry && src && src.text) {
      const text = docSectionBody(entry, src);
      if (asJson) emitJson({ ok: true, slug, section: entry.id, heading: entry.heading, files: src.files, lines: docLines(text).length, text }, 0);
      console.log(text);
      process.exit(0);
    }
  }
  if (!view.document || !fs.existsSync(view.document)) {
    const hint = `no ${DOC_FILE} yet for ${slug} — nothing has been compiled. The sections themselves: orc doc parts ${slug}`;
    if (asJson) emitJson({ ok: false, reason: "no-document", slug, hint }, 1);
    console.error("❌ " + hint);
    process.exit(1);
  }
  const want = want0;
  if (!want || flag("--toc")) {
    const toc = view.sections.map((s) => ({ id: s.id, heading: s.heading, level: s.level, start: s.start, end: s.end, lines: s.lines, state: s.state }));
    if (asJson) emitJson({ ok: true, slug, document: view.document, total_lines: view.total_lines, toc }, 0);
    console.log(ui.header(`ORC · doc read — ${slug}  (${plural(view.total_lines, "line")})`));
    console.log("");
    for (const s of toc)
      console.log(`  ${String(s.start).padStart(5)}..${String(s.end).padEnd(5)} ${"  ".repeat(Math.max(0, s.level - 2))}${s.heading}`);
    console.log(ui.color.gray(`\n  One section at a time:  orc doc read ${slug} --section <id>`));
    process.exit(0);
  }
  const s = view.sections.find((x) => x.id === want || x.id.startsWith(want));
  if (!s) {
    const hint = `no section "${want}" in ${slug} — \`orc doc read ${slug} --toc\` lists them.`;
    if (asJson) emitJson({ ok: false, reason: "no-such-section", slug, section: want, hint }, 2);
    console.error("❌ " + hint);
    process.exit(2);
  }
  const scanned = view.scan.sections.find((x) => x.id === s.id);
  if (asJson) emitJson({ ok: true, slug, section: s.id, heading: s.heading, start: s.start, end: s.end, lines: s.lines, state: s.state, text: scanned.text }, 0);
  console.log(scanned.text);
  process.exit(0);
}

// ── `orc doc next` — the orchestrator's score (v0.48.1) ─────────────────────
// The CLI computes the next legal action; the skill RENDERS it and does exactly
// that. Same shape as the Flow stepper, and for the same reason: D6–D9 used to
// be prose the orchestrator had to hold in its head across a session that might
// be resumed months later in a fresh context. That is precisely the
// remembered-not-dispatched protocol that has failed twice in this repo (the
// v0.32.0 narration lesson).
//
// Exit codes, the `pattern status` / `diy status` convention:
//   0  an action is available
//   1  waiting on a HUMAN decision — `blocked_by` names it in one sentence
//   2  unknown slug
function docNextAction(claudeDir, slug) {
  const view = docMapView(claudeDir, slug);
  if (!view) return null;
  const d = view.d;
  const p = view.paths;
  const v2 = d.version >= DOC_STATE_VERSION;
  const hasDoc = !!view.document && fs.existsSync(view.document);
  const allParts = p.work && fs.existsSync(p.work) ? fs.readdirSync(p.work).filter((f) => f.endsWith(".md")) : [];
  // Only a RECORDED extract is waiting to be spliced. A write-wave part file is
  // consumed by `assemble` and then just lingers in .work/ — treating those as
  // pending splices told every finished document to splice forever.
  const parts = allParts.filter((f) => (d.extracts || {})[f.replace(/\.md$/, "")]);
  const byId = new Map(view.sections.map((s) => [s.id, s]));
  const open = (d.outline || []).filter((o) => {
    const s = byId.get(o.id);
    return o.required && (!s || s.state === "planned" || s.state === "open");
  });
  const lint = hasDoc ? docLintRun(fs.readFileSync(view.document, "utf8"), d.target) : null;
  const A = (phase, action, command, why, paid, alternatives) => ({
    ok: true,
    slug,
    phase,
    action,
    command,
    why,
    paid: !!paid,
    blocked_by: null,
    alternatives: alternatives || [],
  });
  const BLOCK = (phase, blocked_by, alternatives) => ({
    ok: true,
    slug,
    phase,
    action: "ask",
    command: null,
    why: blocked_by,
    paid: false,
    blocked_by,
    alternatives: alternatives || [],
  });

  const ctx = docContextPaths(p);
  if (!fs.existsSync(ctx.context))
    return BLOCK("D1", "no context.md — the brief was never frozen. Ask the D1 question and write it before anything else runs.");

  if (!(d.outline || []).length) return A("D5", "outline", `orc doc outline ${slug} --json`, "there is no agreed outline yet", false);

  // ── v0.49.0 — the folder ladder. Free repairs first, always. ──────────────
  if (!v2)
    return A("D6", "migrate", `orc doc migrate ${slug} --json`, "this document is still v1: one file, and every change routed through it", false, [
      `orc doc audit ${slug} --json`,
    ]);

  const pv = docPartsView(claudeDir, slug);
  const cfg = resolvedConfig(claudeDir);
  const writeMode = d.write_mode || (cfg.doc_write_mode === "ask" ? null : cfg.doc_write_mode);
  const shape = pv.rows.flatMap((r) => r.problems);
  if (shape.length)
    return BLOCK("D6", `${shape[0].what} Nothing was compiled — a nested sub-part that would restructure the deliverable is a refusal, never a silent fix.`, [
      `orc doc parts ${slug} --json`,
    ]);

  if (!writeMode)
    return BLOCK(
      "D6",
      "partial or all — your call. `partial` writes ONE wave and stops so you can read those files and redirect before the rest is paid for; `all` writes every wave.",
      [`orc doc mode ${slug} --set partial`, `orc doc mode ${slug} --set all`]
    );

  const unconfirmed = pv.rows.filter((r) => r.state === "unconfirmed");
  if (unconfirmed.length)
    return A(
      "D6",
      "plan-write",
      `orc doc plan ${slug} --role write --only ${unconfirmed.map((r) => r.id).join(",")} --json`,
      `${plural(unconfirmed.length, "part file")} on disk with no validated return — a wave was killed mid-flight. Re-write, never ship.`,
      true,
      [`orc doc parts ${slug} --json`]
    );

  const notWritten = pv.rows.filter((r) => r.required && !r.exists);
  const wave = docWaveState(d, pv.rows);
  if (notWritten.length) {
    if (writeMode === "all")
      return A("D6", "plan-write", `orc doc plan ${slug} --role write --json`, `${plural(notWritten.length, "required section")} ${notWritten.length === 1 ? "has" : "have"} no source file yet`, true);
    // Partial: after every wave the lane STOPS. The wave-review gate is just
    // another `blocked_by`, which is why the skill needs no new prose for it.
    if (wave && wave.done > 0 && wave.done < wave.total)
      return BLOCK(
        "D6",
        `wave ${wave.done} of ${wave.total} is written. Read those section files and say whether to carry on — nothing later is bought yet.`,
        [`orc doc compile ${slug} --partial`, `orc doc parts ${slug} --json`]
      );
    return A(
      "D6",
      "plan-write",
      `orc doc plan ${slug} --role write --json`,
      `${plural(notWritten.length, "required section")} ${notWritten.length === 1 ? "has" : "have"} no source file yet — partial mode returns wave 1 only`,
      true
    );
  }

  const staleDoc = hasDoc ? docDocStale(pv) : null;
  if (!hasDoc)
    return A("D7", "compile", `orc doc compile ${slug} --json`, "every required section is written and nothing has been compiled yet", false);
  if (staleDoc && staleDoc.length)
    return A(
      "D7",
      "compile",
      `orc doc compile ${slug} --json`,
      `${plural(staleDoc.length, "section")} changed since the last compile (${staleDoc.map((s) => s.heading).join(", ")})`,
      false
    );

  // A section a human edited is never rewritten without an instruction naming
  // it: their wording is not recoverable from this side.
  const edited = pv.rows.filter((s) => s.state === "user-edited");
  if (edited.length && !parts.length)
    return BLOCK(
      "D8",
      `you edited ${edited.map((s) => s.heading).join(", ")} by hand. Nothing rewrites those without you naming them — ask what should change.`,
      [`orc doc read ${slug} --section ${edited[0].id}`]
    );

  // Extract → edit → splice. The half-finished round comes before anything new.
  const stale = parts.map((f) => f.replace(/\.md$/, "")).filter((id) => {
    const rec = (d.extracts || {})[id];
    const live = byId.get(id);
    return rec && live && rec.hash && rec.hash !== live.hash;
  });
  if (stale.length)
    return BLOCK(
      "D8",
      `.work/${stale[0]}.md was extracted from a version that no longer matches the document — splice will refuse. Re-extract, or decide which wording wins.`,
      [`orc doc extract ${slug} --section ${stale[0]}`, `orc doc audit ${slug} --json`]
    );
  if (parts.length && hasDoc)
    return A("D8", "splice", `orc doc splice ${slug}`, `${plural(parts.length, "part file")} waiting in .work/ — bottom-up, so no line number moves under another`, false);
  if (allParts.length && !hasDoc)
    return A("D7", "assemble", `orc doc assemble ${slug}`, `${plural(allParts.length, "part file")} written and nothing assembled yet`, false);

  if (!hasDoc) return A("D6", "plan-write", `orc doc plan ${slug} --role write --json`, "the outline is agreed and nothing has been written", true);

  // THE FREE CHECK ALWAYS RUNS BEFORE THE PAID ONE. `orc doc lint` costs zero
  // tokens and its findings ride in the checker's slice, so no model is ever
  // paid to count sentences.
  const writtenSince = (v2 ? pv.rows : view.sections).filter((s) => s.state === "written").length;
  if (lint && lint.errors)
    return A("D7", "lint", `orc doc lint ${slug} --json`, `${plural(lint.errors, "lint error")} — the free check runs before the paid one`, false, [
      `orc doc map ${slug} --json`,
    ]);
  if (writtenSince)
    return A(
      "D7",
      "plan-check",
      `orc doc plan ${slug} --role check --json`,
      `${plural(writtenSince, "section")} written since the last check`,
      true,
      [`orc doc lint ${slug} --json`, `orc doc map ${slug} --json`]
    );

  if (!v2 && open.length)
    return A("D6", "plan-write", `orc doc plan ${slug} --role write --json`, `${plural(open.length, "required section")} still open`, true);

  const audit = docAuditFindings(claudeDir, slug);
  const blockingAudit = (audit.findings || []).filter((f) => f.level === "error");
  if (blockingAudit.length)
    return A("D9", "audit", `orc doc audit ${slug} --json`, blockingAudit[0].summary, false);

  if (!d.shipped)
    return BLOCK("D9", "the document is complete. Shipping is YOUR decision and it needs a destination — nothing here can infer one.", [
      `orc doc ship ${slug} --where "<where it went>"`,
      `/orc-challenge ${path.relative(p.root, view.document).split(path.sep).join("/")}`,
    ]);

  const drift = docShipDrift(d, view);
  if (drift && drift.length)
    return BLOCK(
      "D9",
      `shipped to ${d.shipped.where}, then ${plural(drift.length, "section")} changed (${drift.map((s) => s.heading).join(", ")}). Re-send it, or say why not.`,
      [`orc doc ship ${slug} --where "<where it went this time>"`, `orc doc audit ${slug} --json`]
    );

  return BLOCK("D9", `shipped ${d.shipped.at} to ${d.shipped.where}, and nothing has changed since. There is nothing to do.`);
}

function docNextCmd(claudeDir, slugArg) {
  const asJson = wantsJson();
  const slug = docResolveSlug(claudeDir, slugArg);
  const next = slug ? docNextAction(claudeDir, slug) : null;
  if (!next) return docNoSuch(asJson, slugArg);
  const code = next.blocked_by ? 1 : 0;
  if (asJson) emitJson(next, code);
  console.log(ui.header(`ORC · doc next — ${slug}`));
  console.log(`\n  ${next.phase}   ${next.action}`);
  console.log(`  ${ui.color.gray(next.why)}`);
  if (next.command) console.log(`\n  ${next.paid ? "PAID  " : "free  "}${next.command}`);
  else console.log(`\n  ${ui.color.yellow("waiting on you: " + next.blocked_by)}`);
  if (next.alternatives.length) console.log(ui.color.gray("\n  also possible: " + next.alternatives.join("  ·  ")));
  process.exit(code);
}

function docTemplatesCmd() {
  const asJson = wantsJson();
  const rows = DOC_TEMPLATES.map((t) => ({
    type: t.type,
    label: t.label,
    about: t.about,
    sections: t.sections.map((s) => ({ heading: s.heading, required: s.required !== false, budget_lines: s.budget, purpose: s.purpose })),
  }));
  if (asJson) emitJson({ ok: true, templates: rows }, 0);
  console.log(ui.header(`ORC · doc templates — ${plural(rows.length, "base template")}`));
  for (const t of rows) {
    console.log(`\n  ${t.type.padEnd(14)} ${t.label}`);
    console.log(`  ${"".padEnd(14)} ${ui.color.gray(t.about)}`);
    t.sections.forEach((s, i) => console.log(`  ${"".padEnd(14)} ${String(i + 1).padStart(3)}. ${s.heading}${s.required ? "" : "  (optional)"}`));
  }
  console.log(ui.color.gray("\n  A template is a floor, not a cage — bring your own with --template <path> and its headings become the outline."));
  process.exit(0);
}

function docTargetsCmd() {
  const asJson = wantsJson();
  if (asJson) emitJson({ ok: true, targets: DOC_TARGETS }, 0);
  console.log(ui.header(`ORC · doc targets — where a Markdown file can actually go`));
  console.log("");
  for (const t of DOC_TARGETS) {
    console.log(`  ${t.id.padEnd(12)} ${t.label.padEnd(28)} imports: ${t.imports}   max H${t.max_heading}   front matter: ${t.front_matter}`);
    console.log(`  ${"".padEnd(12)} ${ui.color.gray(t.watch)}`);
  }
  console.log(ui.color.gray("\n  A lint rule that came from a real product limit is worth ten invented ones."));
  process.exit(0);
}

function doc() {
  if (flag("--global")) {
    console.error("❌ orc doc is project-scoped — the document is this project's. Run it from the project (or with --dir <path>).");
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const pos = docPositionals(); // ["doc", <sub?>, <slug|path?>]
  // The migration is LAZY, free, idempotent and non-destructive: it runs on the
  // first `orc doc <anything> <slug>` where version < 2. Never on `list` — a
  // listing must not mutate — and never on `init`/`migrate`, which own it.
  // `splice` and `extract` are excluded on purpose: a v1 document with a PENDING
  // extract has to reach its own hash-conflict refusal, preserved verbatim,
  // before anything moves. Two sessions on one slug is still a real risk.
  if (pos[1] && !["list", "init", "migrate", "splice", "extract", "templates", "targets"].includes(pos[1])) {
    const s = docResolveSlug(claudeDir, pos[2]);
    if (s) docMigrateV2(claudeDir, s);
  }
  switch (pos[1]) {
    case undefined:
    case "list":
      docListCmd(claudeDir);
      break;
    case "init":
      docInit(claudeDir);
      break;
    case "show":
      docShowCmd(claudeDir, pos[2]);
      break;
    case "map":
      docMapCmd(claudeDir, pos[2]);
      break;
    case "plan":
      docPlanCmd(claudeDir, pos[2]);
      break;
    case "outline":
      docOutlineCmd(claudeDir, pos[2]);
      break;
    case "extract":
      docExtractCmd(claudeDir, pos[2]);
      break;
    case "splice":
      docSpliceCmd(claudeDir, pos[2]);
      break;
    case "assemble":
      // Alias for one release, naming the new command. Exit codes preserved.
      docCompileCmd(claudeDir, pos[2], { alias: "assemble" });
      break;
    // v0.49.0 — sections/ is the source of truth, document.md is a build artifact
    case "compile":
      docCompileCmd(claudeDir, pos[2]);
      break;
    case "parts":
      docPartsCmd(claudeDir, pos[2]);
      break;
    case "split":
      docSplitCmd(claudeDir, pos[2]);
      break;
    case "migrate":
      docMigrateCmd(claudeDir, pos[2]);
      break;
    case "mode":
      docModeCmd(claudeDir, pos[2]);
      break;
    case "lint":
      docLintCmd(claudeDir, pos[2]);
      break;
    case "status":
      docStatusCmd(claudeDir, pos[2]);
      break;
    // v0.48.1 — the score, the finish line, the drift report and the memory.
    case "next":
      docNextCmd(claudeDir, pos[2]);
      break;
    case "ship":
      docShipCmd(claudeDir, pos[2], false);
      break;
    case "unship":
      docShipCmd(claudeDir, pos[2], true);
      break;
    case "audit":
      docAuditCmd(claudeDir, pos[2]);
      break;
    case "log":
      docLogCmd(claudeDir, pos[2]);
      break;
    case "journal":
      docJournalCmd(claudeDir, pos[2]);
      break;
    case "context":
      docContextCmd(claudeDir, pos[2]);
      break;
    case "read":
      docReadCmd(claudeDir, pos[2]);
      break;
    case "templates":
      docTemplatesCmd();
      break;
    case "targets":
      docTargetsCmd();
      break;
    default:
      console.error(
        `Unknown: orc doc ${pos[1]}\n` +
          "Usage: orc doc list [--json]                        every document + its `Where it stands:` line\n" +
          "       orc doc next <slug> [--json]                 THE NEXT LEGAL ACTION. 0 = do it / 1 = a human decides / 2 = unknown\n" +
          "       orc doc status <slug> [--json]               0 nothing to do / 1 something to do / 2 unknown slug\n" +
          "       orc doc show <slug> [--json]                 full state: sections, cycles, extracts\n" +
          "       orc doc map <slug> [--json]                  the DERIVED section map (fresh line numbers)\n" +
          "       orc doc parts <slug> [--confirm <ids>]       the SECTION FILES (works before any compile)\n" +
          "       orc doc compile <slug> [--partial]           sections/ -> document.md. FREE, on demand\n" +
          "       orc doc split <slug> [--section <id> --by-heading]  document -> sections/, or a section -> parts\n" +
          "       orc doc migrate <slug> [--clean]             v1 -> v2, lazy and non-destructive\n" +
          "       orc doc mode <slug> [--set partial|all]      how much is bought at once\n" +
          "       orc doc plan <slug> --role write|check|edit  the batching (never splits a section, <=2)\n" +
          "       orc doc outline <slug> [--set <path>]        the agreed section list\n" +
          "       orc doc extract <slug> --section <id>        alias — in v2 the section file IS the extract\n" +
          "       orc doc splice <slug>                        alias -> compile (v1 parts are drained first)\n" +
          "       orc doc assemble <slug>                      alias -> compile\n" +
          "       orc doc lint <slug|path> [--target <t>]      the free check (0 clean / 1 findings / 2 none)\n" +
          "       orc doc audit <slug> [--json]                every drift class, from disk (0 clean / 1 findings)\n" +
          "       orc doc ship <slug> --where <destination>    record the delivery. --where has NO DEFAULT\n" +
          "       orc doc unship <slug> --reason <text>        undo it; the old record is kept in ship_history\n" +
          "       orc doc log <slug> --kind request|decision|gate|note|gap --text <t>\n" +
          "       orc doc journal <slug> [--json]              the ordered story, gaps shown AS gaps\n" +
          "       orc doc context <slug> [--json]              the frozen brief + whether its sources still hold\n" +
          "       orc doc read <slug> [--section <id>|--toc]   FOR THE HUMAN — the orchestrator never runs this\n" +
          "       orc doc templates | targets [--json]\n" +
          "       orc doc init <slug> --type <" + DOC_TYPES.join("|") + "> [--template <p>] [--target <t>]"
      );
      process.exit(1);
  }
}

function where() {
  const claudeDir = resolveClaudeDir();
  if (wantsJson())
    return emitJson({
      claude_dir: claudeDir,
      project_root: repoRootOf(claudeDir),
      package_root: PKG_ROOT,
      package_version: currentVersion(),
      installed_version: installedPayloadVersion(claudeDir),
      skills: path.join(claudeDir, "skills"),
      commands: path.join(claudeDir, "commands"),
      agents: path.join(claudeDir, "agents"),
      hooks: path.join(claudeDir, "hooks"),
      settings: path.join(claudeDir, "settings.json"),
      config: overridePath(claudeDir),
      run_dir: resolveRunDir(claudeDir),
      log_dir: resolveLogDir(claudeDir),
    });
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

// ── orc doctor (B6) — installed-side drift detector ────────────────────────
// Read-only health report over a target .claude/ (respects --global / --dir).
// `orc doctor --fix` = update + prune + settings re-merge (install overwrite).
// `orc doctor --json` renders the SAME findings as one JSON object on stdout —
// nothing else, no banner, no colour, no nudge — for a script or a CI step. The
// EXIT CODE is identical either way (0 healthy / 1 issues found): the flag
// changes the rendering only, never the semantics.
function doctor() {
  const claudeDir = resolveClaudeDir();
  const asJson = flag("--json") === true;
  if (flag("--fix") === true) {
    // A mutation and a machine-readable read-only report are two different
    // commands. Refusing beats silently handing a script the human output.
    if (asJson) {
      console.error("❌ orc doctor --json is read-only — drop --fix (or run the two separately).");
      process.exit(1);
    }
    console.log(`Applying fixes to ${claudeDir} (update + prune + settings re-merge)…\n`);
    install({ overwrite: true, forcePrune: true });
    console.log("\nRe-run `orc doctor` to confirm a clean report.");
    return;
  }

  const say = asJson ? () => {} : (s) => console.log(s);
  say(ui.color.bold(`orc doctor`) + ` — ${claudeDir}\n`);
  const problems = [];
  const findings = [];
  const ok = (s) => say("  " + ui.mark.ok(s));
  // id: stable machine key. fixable: would `orc doctor --fix` address it?
  const warn = (id, s, extra) => {
    say("  " + ui.mark.warn(s));
    problems.push(s);
    findings.push(Object.assign({ id, severity: "warn", message: s, fixable: false }, extra || {}));
  };

  // 1) payload version vs this CLI's version
  const cliVersion = currentVersion();
  let installedVersion = null;
  if (!fs.existsSync(path.join(claudeDir, "hooks"))) {
    warn("no-payload", "no ORC payload here (hooks/ missing) — run `orc init`.", { fixable: true });
  } else {
    const payloadV = (installedVersion = installedPayloadVersion(claudeDir));
    const cliV = cliVersion;
    if (payloadV === cliV) ok(`payload version ${payloadV} matches this CLI`);
    else
      warn("version-skew", `payload version ${payloadV} != CLI ${cliV} — run \`orc update\``, {
        fixable: true,
        installed_version: payloadV,
        package_version: cliV,
      });
  }

  // 1b) GLOBAL install skew (C5). Claude Code resolves a skill by NAME, and a
  // stale ~/.claude copy can win over this project's — so a report of "payload
  // matches" is worthless if the file that actually loads is three versions
  // old. Warn, never delete: a global install is not this project's to prune.
  const globalDir = path.join(os.homedir(), ".claude");
  const globalInfo = { present: false, version: null, shadows: false };
  if (path.resolve(globalDir) !== path.resolve(claudeDir)) {
    if (!fs.existsSync(path.join(globalDir, "hooks"))) {
      ok("no global ORC install (~/.claude) — nothing can shadow this one");
    } else {
      const globalV = installedPayloadVersion(globalDir);
      const localV = installedPayloadVersion(claudeDir);
      globalInfo.present = true;
      globalInfo.version = globalV;
      if (globalV !== localV) {
        globalInfo.shadows = true;
        warn(
          "global-skew",
          `GLOBAL install ~/.claude is ${globalV} but this project is ${localV} — ` +
            "the global copy can win skill resolution; run `orc update --global`",
          { global_version: globalV, local_version: localV }
        );
      } else ok(`global install ~/.claude matches (${globalV})`);
      // Agent files the global install still carries that this payload no
      // longer ships: a dispatch by a retired name resolves there instead of
      // failing loudly — the exact silent downgrade a rename must prevent.
      try {
        const shipped = new Set(shippedFootprint());
        const shadows = fs
          .readdirSync(path.join(globalDir, "agents"))
          .filter((f) => /^orc-.*\.md$/i.test(f) && !shipped.has("agents/" + f));
        if (shadows.length) {
          globalInfo.shadows = true;
          // `--prune` is NOT optional here, and saying `orc update --global`
          // alone made this finding permanent. These names were retired BEFORE
          // the manifest now on disk was written, so no manifest ever claimed
          // them: the auto-prune (which only deletes what a previous manifest
          // proves ORC owned) can never reach them, and a plain update just
          // re-reports them forever. The candidate sweep that DOES catch them
          // is gated on --prune by design — it is deleting files nothing proves
          // are ours.
          warn(
            "global-retired-agents",
            `${shadows.length} retired agent name(s) still live in ~/.claude/agents: ` +
              shadows.slice(0, 5).join(", ") + (shadows.length > 5 ? " …" : "") +
              " — run `orc update --global --prune` (--prune is required: no manifest claims these, " +
              "so a plain update only reports them; never deleted from here)",
            { paths: shadows.map((f) => "agents/" + f), fix_command: "orc update --global --prune" }
          );
        } else ok("no retired agent names shadowing from ~/.claude/agents");
      } catch (_) {}
    }
  }

  // 2) manifest vs the shipped footprint (orphans + missing files)
  const footprint = shippedFootprint();
  const current = new Set(footprint);
  const manifest = readManifest(claudeDir);
  const trunc = (a) => a.slice(0, 5).join(", ") + (a.length > 5 ? " …" : "");
  const missing = footprint.filter((f) => !fs.existsSync(path.join(claudeDir, f)));
  if (!manifest) {
    const cand = detectPreManifestOrphans(claudeDir, current);
    if (cand.length)
      warn(
        "orphan-candidates",
        `${cand.length} possible orphan(s), no install manifest: ${trunc(cand)} — \`orc update --prune\``,
        { fixable: true, paths: cand }
      );
    else ok("no install manifest yet; no ORC-named orphans detected");
  } else {
    const orphans = manifest.files.filter(
      (f) => !current.has(f) && isPrunable(f) && fs.existsSync(path.join(claudeDir, f))
    );
    if (orphans.length)
      warn("orphan", `${orphans.length} orphan(s) from a prior payload: ${trunc(orphans)} — \`orc update\``, {
        fixable: true,
        paths: orphans,
      });
    else ok("no orphaned files from prior payloads");
  }
  if (missing.length)
    warn("missing-files", `${missing.length} shipped file(s) missing on disk: ${trunc(missing)} — \`orc update\``, {
      fixable: true,
      paths: missing,
    });
  else ok("all shipped files present on disk");

  // 3) settings.json wiring
  let settings = null;
  try {
    settings = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8"));
  } catch (_) {}
  if (!settings) {
    warn("settings-missing", "settings.json missing or unparseable — run `orc update` to re-merge the guards.", {
      fixable: true,
    });
  } else {
    const hooks = settings.hooks || {};
    const hasCmd = (arr, needle) =>
      (arr || []).some((e) => (e.hooks || []).some((h) => typeof h.command === "string" && h.command.includes(needle)));
    if (hasCmd(hooks.PreToolUse, "orc-effort-guard")) ok("effort guard wired (PreToolUse)");
    else warn("effort-guard-unwired", "effort guard NOT wired — /orc won't be effort-gated; run `orc update`", { fixable: true });
    const traceEntry = (hooks.PreToolUse || []).find((e) =>
      (e.hooks || []).some((h) => typeof h.command === "string" && h.command.includes("orc-trace"))
    );
    if (!traceEntry)
      warn("trace-hook-unwired", "trace hook NOT wired on PreToolUse — SPAWN lines lost; run `orc update`", { fixable: true });
    else if (!/Task/.test(traceEntry.matcher || "") || !/Agent/.test(traceEntry.matcher || ""))
      warn(
        "trace-hook-matcher",
        'trace PreToolUse matcher is "' + (traceEntry.matcher || "") + '" — needs "Task|Agent"; run `orc update`',
        { fixable: true }
      );
    else ok('trace hook wired with a Task|Agent matcher');
    if (hasCmd(hooks.SubagentStop, "orc-trace")) ok("trace RETURN wired (SubagentStop)");
    else warn("trace-return-unwired", "trace RETURN hook NOT wired (SubagentStop) — run `orc update`", { fixable: true });
    if (settings.statusLine && typeof settings.statusLine.command === "string") {
      if (settings.statusLine.command.includes("orc-statusline")) ok("statusline is ORC's model warning");
      else ok("statusline present (yours — ORC left it untouched)");
    } else
      warn("statusline-missing", "no statusLine — the non-Opus/high model warning won't show; run `orc update`", {
        fixable: true,
      });
  }

  // 4) dangling trace .current pointer
  const logRel = readOverride(claudeDir).map.log_dir || ".claude/orc/logs";
  const logDir = path.isAbsolute(logRel) ? logRel : path.join(claudeDir, "..", logRel);
  const curFile = path.join(logDir, ".current");
  try {
    if (fs.existsSync(curFile)) {
      const cur = fs.readFileSync(curFile, "utf8").trim();
      if (cur && !fs.existsSync(path.join(logDir, cur)))
        warn(
          "trace-pointer-dangling",
          `trace .current points to a missing file "${cur}" (a fresh run rotates past it — harmless)`,
          { trace_current: cur }
        );
      else ok("trace pointer resolves (or no active run)");
    } else ok("no trace pointer yet (no run recorded)");
  } catch (_) {}

  // 5) stale DIY lock (only meaningful once configured)
  const dstat = diyStatus(claudeDir);
  if (dstat.state === "UNCONFIGURED") ok("orc-diy not configured (fine — /orc-diy stays gated)");
  else if (dstat.state === "STALE") warn("diy-stale", `orc-diy flow STALE: ${dstat.reason}`, { reason: dstat.reason });
  else ok(`orc-diy flow READY (${dstat.reason})`);

  // 6) a document that drifted (v0.48.1). Routed to the Docs panel via
  // FINDING_ROUTE — a caution points at the panel that can CLEAR it, and
  // `orc doc audit` / `orc doc ship` both live there.
  try {
    const dirty = [];
    for (const s of docList(claudeDir)) {
      const res = docAuditFindings(claudeDir, s);
      const errs = res ? res.findings.filter((f) => f.level === "error").length : 0;
      const warns = res ? res.findings.length - errs : 0;
      if (res && res.findings.length) dirty.push({ slug: s, errors: errs, warnings: warns });
    }
    if (dirty.length)
      warn(
        "doc-drifted",
        `${plural(dirty.length, "document")} audit dirty: ${dirty.map((x) => x.slug).join(", ")} — \`orc doc audit <slug>\` names each finding and its fix`,
        { documents: dirty }
      );
    else if (docList(claudeDir).length) ok(`${plural(docList(claudeDir).length, "document")}, none drifted`);
  } catch (_) {}

  if (asJson) {
    // Exactly one object, then the same exit code the human path would use.
    process.stdout.write(
      JSON.stringify(
        {
          ok: problems.length === 0,
          claude_dir: claudeDir,
          installed_version: installedVersion,
          package_version: cliVersion,
          global_install: globalInfo,
          findings,
          fixable: findings.some((f) => f.fixable),
        },
        null,
        2
      ) + "\n"
    );
    process.exit(problems.length ? 1 : 0);
  }

  console.log("");
  if (problems.length) {
    console.log(
      "  " + ui.mark.warn(ui.color.bold(`${problems.length} issue(s) found.`)) +
        " Fix automatically with:  orc doctor --fix"
    );
    process.exit(1);
  }
  console.log("  " + ui.color.green("✅ ORC install looks healthy."));
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
// The changelog lives in CHANGELOG.md next to that package.json, on the same
// branch `orc upgrade` installs from — so "what would I get" is answered by the
// same source as "is there something newer", never by a second one that could
// describe a different release. (It lived in the README until the README was
// compacted; the README now carries only the newest entry and links here, so
// reading the README would answer with one entry no matter how far behind you
// are.)
const CHANGELOG_URL =
  process.env.ORC_CHANGELOG_URL ||
  "https://raw.githubusercontent.com/azure-id/orc/main/CHANGELOG.md";
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
  // Preserve any remembered last_good_spec — writeCache overwrites the whole file.
  writeCache({ ...(cache || {}), checkedAt: Date.now(), latest });
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
  if (wantsJson()) {
    const latest = updateCheckDisabled() ? null : await getLatestVersion({ force: true });
    return emitJson({
      version: cur,
      latest,
      update_available: !!(latest && semverGt(latest, cur)),
      // What `orc upgrade` would actually install — the resolved source matters
      // more than the version number when approving a network mutation.
      install_spec: process.env.ORC_INSTALL_SPEC || readLastGoodSpec() || TARBALL_SPEC,
      check_disabled: updateCheckDisabled(),
    });
  }
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

// ---------------------------------------------------------------------------
// orc changelog — "what would I actually get if I upgraded".
//
// A version number is not a reason to upgrade. This fetches CHANGELOG.md from
// the same branch `orc upgrade` installs from and returns the entries NEWER than
// what is installed, so the answer and the payload can never describe different
// releases.
//
// Parsing is deliberately forgiving: the changelog is prose a human maintains,
// and a heading that does not match must degrade to "no entries", never to a
// crash or a wrong entry. Anything unparsed is simply not reported.
// ---------------------------------------------------------------------------

// Zero-dep HTTPS GET → text (or null). Same bounded, redirect-following,
// fail-silent shape as httpsGetJson — this one just does not parse.
function httpsGetText(url, timeoutMs) {
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
      const req = https.get(url, { headers: { "User-Agent": "orc-cli" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          httpsGetText(res.headers.location, timeoutMs).then(done);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          return done(null);
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => done(data));
      });
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

// Split CHANGELOG.md into entries (a `## Changelog` heading, if present, marks
// where they start — otherwise the whole document is the changelog, which is
// what CHANGELOG.md itself is). The shape this reads is the one this repo's own
// CHANGELOG.md uses and the changelog rule in CLAUDE.md mandates:
// `### v<semver> — <title> _(<date>)_`, newest first.
function parseChangelog(md) {
  if (!md) return [];
  const start = md.search(/^##\s+Changelog\s*$/m);
  const body = start === -1 ? md : md.slice(start);
  const out = [];
  // Headings only — `###` exactly, so a `####` inside an entry stays body text.
  const re = /^###\s+v(\d+\.\d+\.\d+)\s*(?:[—-]\s*)?([^\n]*?)\s*$/gm;
  const hits = [];
  let m;
  while ((m = re.exec(body))) hits.push({ version: m[1], rest: m[2] || "", at: m.index, end: re.lastIndex });
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const next = hits[i + 1];
    // `_(2026-08-08)_` is the date convention; a missing one is not an error.
    const dateM = h.rest.match(/_\((\d{4}-\d{2}-\d{2})\)_/);
    out.push({
      version: h.version,
      title: h.rest.replace(/_\(\d{4}-\d{2}-\d{2}\)_/, "").trim(),
      date: dateM ? dateM[1] : null,
      // An entry ends at the next `###` — OR at the next `##`, whichever comes
      // first. A level-2 heading is a DOCUMENT section (`## Earlier releases`),
      // never part of a release, and without this cut the newest entry's body
      // carried that heading and the rule above it into the upgrade modal.
      body: body
        .slice(h.end, next ? next.at : undefined)
        .split(/\n##(?!#)\s/)[0]
        .replace(/\s*\n-{3,}\s*$/, "")
        .trim(),
    });
  }
  return out;
}

async function changelog() {
  const cur = currentVersion();
  const disabled = updateCheckDisabled();
  const md = disabled ? null : await httpsGetText(CHANGELOG_URL, 4000);
  const all = parseChangelog(md);
  // Only what you do not already have. An "upgrade" that lists the release you
  // are running is noise, and reads as though the check is broken.
  const newer = all.filter((e) => semverGt(e.version, cur));

  if (wantsJson()) {
    return emitJson({
      version: cur,
      latest: all.length ? all[0].version : null,
      update_available: !!(all.length && semverGt(all[0].version, cur)),
      entries: newer,
      source: CHANGELOG_URL,
      // Told apart on purpose: opted out, unreachable, and "nothing new" are
      // three different answers and the UI renders each differently.
      check_disabled: disabled,
      fetched: md !== null,
    });
  }

  if (disabled) return console.log("Update checks are disabled (ORC_NO_UPDATE_CHECK).");
  if (md === null) return console.log("(couldn't fetch the changelog — offline or source unreachable)");
  if (!newer.length) return console.log(`orc ${cur} — up to date. Nothing newer in the changelog.`);
  console.log(`orc ${cur} → ${newer[0].version}\n`);
  for (const e of newer) {
    console.log(`### v${e.version}${e.date ? "  (" + e.date + ")" : ""}`);
    if (e.title) console.log("  " + e.title);
    console.log("");
  }
  console.log("Run `orc upgrade` to install.");
}

// ── orc onboarding (D.2) — the "never need the GitHub README" walkthrough ────
function renderOnboardingSection(s) {
  console.log(ui.header(s.title));
  for (const line of s.lines) {
    // style a leading command token / slash command in cyan for scannability
    console.log("  " + line.replace(/(\/orc[\w-]*|orc [a-z][\w -]*?)(?=\s{2,}|$)/, (m) => ui.color.cyan(m)));
  }
}

function onboarding() {
  const pos = positionals(); // ["onboarding", <topic?>]
  const topic = pos[1];

  if (topic) {
    const s = ONBOARDING.find((x) => x.id === topic || x.id.startsWith(topic));
    if (!s) {
      console.error(
        `Unknown onboarding topic: ${topic}\n` +
          "Topics: " + ONBOARDING.map((x) => x.id).join(", ")
      );
      process.exit(1);
    }
    renderOnboardingSection(s);
    console.log("");
    return;
  }

  // Non-TTY (a model/agent, a pipe): print everything in one shot.
  if (!process.stdin.isTTY) {
    console.log(ui.color.bold("\norc onboarding — the full ORC walkthrough\n"));
    for (const s of ONBOARDING) renderOnboardingSection(s);
    console.log("\n" + ui.color.gray("Jump to one topic later with: orc onboarding <topic>"));
    return;
  }

  // TTY: a numbered section menu.
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));
  (async () => {
    for (;;) {
      console.log(ui.header("orc onboarding — pick a topic"));
      ONBOARDING.forEach((s, i) =>
        console.log(`  ${String(i + 1).padStart(2)}) ${s.title}`)
      );
      console.log("   a) show all      q) quit");
      const choice = (await ask("\n> ")).trim().toLowerCase();
      if (choice === "" || choice === "q") break;
      if (choice === "a") {
        for (const s of ONBOARDING) renderOnboardingSection(s);
        continue;
      }
      const s = ONBOARDING[Number(choice) - 1];
      if (!s) {
        console.log("  ? not a valid choice");
        continue;
      }
      renderOnboardingSection(s);
    }
    rl.close();
    console.log("done.");
  })();
}

// ── orc ui (v0.43.0) — the local web control panel ─────────────────────────
// A browser panel for everything in ORC that is NOT ai: settings, install
// health, run history, knowledge state, usage stats and the mock examples runs
// leave behind. It never runs a lane, never spawns `claude`, never calls the
// Anthropic API — that boundary is the whole design, and everything it shows or
// writes is deterministic output from THIS CLI (the server shells out to it).
//
// PROJECT-SCOPED, and deliberately so: one repo, one server, one settings file,
// exactly like `orc diy` / `orc crosslink` / `orc wiki` / `orc pattern`. There
// is no --global. `--dir` still points at ONE other project; it does not make
// the panel span several.
const UI_DEFAULT_PORT = 9921;

function uiCmd() {
  if (flag("--global")) {
    console.error(
      "❌ orc ui is project-scoped — one repo, one server, one settings file.\n" +
        "   Config does not merge: ~/.claude and <project>/.claude are two independent\n" +
        "   files, so editing both from one panel would be genuinely ambiguous.\n" +
        "   Run it from the project (or with --dir <path>). `orc doctor` reports a\n" +
        "   global install that can win skill resolution."
    );
    process.exit(1);
  }
  const claudeDir = resolveClaudeDir();
  const webui = require("./webui/serve.js");

  if (flag("--stop") === true) process.exit(webui.stop(claudeDir));

  const fixtures = flag("--fixtures") === true;
  const portRaw = flag("--port");
  const explicitPort = typeof portRaw === "string";
  const port = explicitPort ? Number(portRaw) : UI_DEFAULT_PORT;
  if (explicitPort && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    console.error(`❌ --port must be a number between 1 and 65535 (got "${portRaw}").`);
    process.exit(1);
  }
  const idleRaw = flag("--idle");
  const idleMinutes = typeof idleRaw === "string" ? Number(idleRaw) : webui.DEFAULT_IDLE_MIN;
  if (!Number.isFinite(idleMinutes) || idleMinutes < 0) {
    console.error(`❌ --idle must be minutes >= 0 (0 disables the timeout).`);
    process.exit(1);
  }

  // Fixture mode needs no project at all — that is half its point.
  if (!fixtures && !fs.existsSync(path.join(claudeDir, "hooks")))
    console.error(
      "  ⚠ no ORC payload here yet (run `orc init`). The panel will open, but most\n" +
        "    of it will read empty. `orc ui --fixtures` shows it with canned data."
    );

  webui
    .serve({
      claudeDir,
      projectRoot: repoRootOf(claudeDir),
      port,
      explicitPort,
      open: flag("--no-open") !== true,
      idleMinutes,
      fixtures,
      version: currentVersion(),
    })
    .then((code) => {
      if (typeof code === "number") process.exit(code);
    })
    .catch((e) => {
      console.error("❌ orc ui failed to start: " + (e && e.message));
      process.exit(1);
    });
}

function help() {
  console.log(`orc — install the ORC Claude Code skill constellation

New? Run \`orc onboarding\` for the full walkthrough (no GitHub README needed).

Usage:
  orc init [--global | --dir <path>]      copy skills + commands (skips existing)
  orc update [--global | --dir <path>]    overwrite existing orc files (local copy only)
                                          [--prune]  also delete ORC-named orphans from a
                                                     pre-manifest install (renamed/removed files)
  orc upgrade [--global | --dir <path>]   fetch the LATEST package, then apply it
                                          [--from <spec>]  (default order: last-good,
                                          then the tarball, then ${GITHUB_SPEC})
  orc config [--global | --dir <path>]    view/change settings (interactive menu)
    orc config list                       print effective config (default vs override)
    orc config set <key> <value>          validate + write one setting
    orc config reset [key]                revert one key (or all) to defaults
    orc config path                       print the override file location
    orc config profile [<name>]           apply a coherent bundle over the existing keys
                                          (solo-fast, balanced, paranoid, token-lean);
                                          no name = list them with what each is for
    orc config recommend                  read-only: probe this repo (tests? CI? size?
                                          wiki? monorepo?) and suggest ONE profile, with
                                          the reasons it decided from
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
    orc wiki status [--json]              registration state + COMPUTED freshness tier — a doc is
                                          stale only when its OWN covered files changed; edges from
                                          config wiki_fresh_max / wiki_aging_max
    orc wiki sync [--check]               rebuild wiki-meta.json + INDEX.md from the docs on disk
                                          (instant, no re-scan — this is the repair for an
                                           unregistered wiki, e.g. a scan stopped at a pause)
    orc wiki impact                       commit-scoped delta probe — per registered doc
                                          CLEAN | TOUCHED (n) | STRUCTURAL vs scan_commit
                                          (exit 0 clean / 1 can't compute / 2 delta / 3 full)
    orc wiki plan [--json]                RANKED, priced work list: what to refresh, in what
                                          order, for how much. STRUCTURAL first, then use×delta,
                                          zero-use docs last with a retire hint. Free repairs are
                                          always listed BEFORE anything that costs money
                                          (exit 0 nothing / 1 all light / 2 a deep scan / 3 n/a)
    orc wiki debt [--json]                one line: docs pending, tokens, \$, oldest debt
                                          (exit 0 no debt / 1 debt exists / 3 no wiki)
    orc wiki usage [--rebuild] [--json]   which docs runs actually put into a slice, from the
                                          trace corpus — the input to plan's ranking
  orc pact [--dir <path>]                 the invariant ledger — the promises this project makes,
                                          and which ones are in doubt right now
    orc pact status [--json]              HOLDING | DRIFTED | UNCHECKABLE | BROKEN, all COMPUTED
                                          (exit 0 all holding / 1 any drifted / 2 any broken /
                                           3 no ledger). UNCHECKABLE never raises the code
    orc pact check [<id>]                 run the cheap checks and re-anchor what passes
    orc pact sync                         re-render the derived PACT.md from the ledger
  orc boundary [--dir <path>]             execute · escalate · refuse, per AREA
    orc boundary status [<path>] [--json] (exit 0 all EXECUTE / 1 any ESCALATE / 2 any REFUSE /
                                          3 no card or a stale card). A REFUSE always names what
                                          would make it a yes
  orc handoff [--dir <path>]              what a non-developer can safely change
    orc handoff surfaces [--json]         the graded map: 🟢 a check will catch a mistake ·
                                          🟡 the check is manual · 🔴 ORC will not touch it
    orc handoff set <id> <key> <value>    change one value on a GREEN/AMBER surface. Prints the
                                          undo command BEFORE the write; never stages, never commits
  orc budget [--dir <path>]               what a run costs, in the unit YOU are billed in
    orc budget forecast <plan> [--as …]   tokens (in/cache-w/cache-r/out) · usd · quota · context
                                          risk, per band, as a RANGE with a sample count
                                          (exit 0 / 1 a low-confidence band / 2 context risk /
                                           3 no history). [--naive] = price table only
    orc budget actual <run-slug>          what the run really cost, vs the rate model
    orc budget rates [--json]             what the corpus says per band, in tokens
    orc budget calibrate                  rebuild the model from traces + local transcripts
  orc aftermath [--dir <path>]            did the thing we shipped hold up (read-only, no telemetry)
    orc aftermath status [--since Nd]     churn · a deleted test · a revert · a broken promise
                                          (exit 0 clean / 1 churn / 2 a revert / 3 too shallow).
                                          Churn is a SIGNAL, never a verdict
  orc challenge [--dir <path>]            grade a FINISHED artifact against a goal you stated —
                                          ORC judges, you fix, ORC re-judges, and it never fixes
                                          what it judged (project-scoped; no --global)
    orc challenge list [--json]           every cycle + its COMPUTED state
                                          (exit 0 all passed / 1 any in-flight / 3 no cycles)
    orc challenge status <slug> [--json]  one cycle (exit 0 passed / 1 open blocking findings /
                                          2 a P0 is open / 3 unknown slug)
    orc challenge show <slug> [--iteration N]   full detail incl. every finding
    orc challenge diff <slug>             resolve the expected revision, then per-finding
                                          touched/untouched (exit 0 unchanged / 1 changed /
                                          2 MISSING-REVISION / 3 unknown). A HINT for you —
                                          never an input to the judge, which always re-reads
    orc challenge expect <slug> [--set <path>]  where the next revision is expected; --set
                                          records a deviation instead of ORC guessing one
    orc challenge lint <path> [--template <p>]  deterministic prose + structure lint, ZERO model
                                          tokens (exit 0 clean / 1 findings / 2 unreadable).
                                          Useful with no cycle and no model at all
    orc challenge outline <path>          the heading tree
    orc challenge record <slug> --iteration N --from <json>
                                          THE GATE: rejects coverage < 100%, an unknown carry id,
                                          an ignored rebuttal and a silent dimension; drops a
                                          finding with no \`serves\`; and COMPUTES pass/fail
    orc challenge accept <slug> <id> "reason"   accept a known gap — it stops blocking and stays
                                          visible forever with your reason
    orc challenge rebut <slug> <id> "reason"    the judge is wrong; the next verdict must answer it
    orc challenge template|goals <slug> [--set <path> --reason "…"]
                                          print the frozen yardstick, or re-freeze it (a recorded
                                          event; prior iterations keep their stamp)
    orc challenge report <slug>           re-derive CHALLENGE.md (+ the final report on a pass)
    orc challenge init <slug> --artifact <p> --kind <k> --goal … --audience … --done-means …
                                          [--out-of-scope …] [--context-ref …]
                                          (--template <p> | --no-template) [--dimensions D1,D2,…]
                                          [--revision in-place|new-file|directory --revision-pattern …]
                                          --goal/--audience/--done-means have NO default: ORC never
                                          guesses what "good" means here
  orc doc [--dir <path>]                  write a long document — PRD · TSD · collaboration
                                          agreement · report · workflow — as portable Markdown
                                          (project-scoped; no --global). The orchestrator never
                                          reads the document body; it reads the map below
    orc doc list [--json]                 every document + its \`Where it stands:\` line
    orc doc status <slug> [--json]        one document (exit 0 complete / 1 in progress /
                                          2 unknown slug). A prefix is enough for <slug>
    orc doc show <slug> [--json]          full state: outline, sections, cycles, extracts
      … --section <id>                    ONE section's text, on an explicit request — the only
                                          command that returns any of the document's prose
    orc doc map <slug> [--json]           THE SECTION MAP — heading, absolute line range, hash and
                                          computed state per section. Derived on every read and
                                          NEVER stored: a stored line number is a wrong line number
                                          one edit later
    orc doc parts <slug> [--json]         THE SECTION FILES — one row per section (and per stored
                                          sub-part), with its computed state. Works BEFORE a single
                                          compile has ever run, because the files ARE the progress
      … --confirm <id,id>                 record a VALIDATED RETURN's hash. Until then a file on
                                          disk is \`unconfirmed\`: a wave killed by a usage limit
                                          leaves exactly that, and it is re-written, never shipped
    orc doc compile <slug> [--partial]    sections/ → document.md. ZERO model tokens, on demand.
                                          --partial writes what exists and NAMES what is missing;
                                          nothing is ever stubbed into the deliverable
      … --strip-annotations               remove ORC's own markers, on your explicit request only
    orc doc split <slug>                  document.md → sections/ (also free). Recovers a document
                                          a human reshaped by hand
      … --section <id> --by-heading       store ONE big section as sub-parts, cut on its own
                                          \`###\` headings. Invisible to the reader and to the map
    orc doc migrate <slug> [--clean]      v1 → v2. Lazy, idempotent, non-destructive: document.md
                                          is never deleted, and an unparseable one is REFUSED
    orc doc mode <slug> [--set partial|all]
                                          how much of the document is bought at once. \`partial\`
                                          writes ONE wave and stops so you can redirect
    orc doc plan <slug> --role write|check|edit [--only <ids>]
                                          the batching: never splits a section, never exceeds
                                          doc_max_parallel (hard cap 2) or the per-agent line
                                          budget (exit 0 work to do / 1 nothing to do). ONE FILE
                                          PER SECTION — never one file for a two-section slice
    orc doc outline <slug> [--set <path>] the agreed section list; --set adopts another file's
                                          headings (a structure is never guessed out of prose) and
                                          RENAMES the files on disk in the same step
    orc doc extract <slug> --section <id> alias. In v2 the section file IS the extract, so nothing
                                          is copied — it prints the path and records the hash
    orc doc splice <slug>                 alias → compile. A v1-era pending part is drained first,
                                          hash-guarded (exit 1 = a section changed on disk and
                                          nothing was overwritten)
    orc doc assemble <slug>               alias → compile
    orc doc lint <slug|path> [--target <t>]
                                          the FREE check: portability rules from a real product
                                          limit, plus readability signals (exit 0 clean /
                                          1 findings / 2 unreadable). Zero model tokens
    orc doc templates [--json]            the five base templates + their section lists
    orc doc targets [--json]              where a Markdown file can actually go, and what to watch
    orc doc init <slug> --type <t> [--template <p>] [--title …] [--language …]
                                          [--target <t>] [--length short|standard|thorough]
  orc export [--dir <path>]               compile the wiki + patterns + PACT.md + boundary cards
                                          into a portable AGENTS.md — derived, fingerprinted
                                          [--target agents-md|skill|both]
                                          [--check]  fail when the export is stale (exit 1)
    orc export import                     read an existing AGENTS.md/.cursorrules as EVIDENCE and
                                          propose ORC config + pact seeds (never applies anything)
  orc pattern [--dir <path>]              cached code-patterns (project-scoped; no --global)
    orc pattern status [<lang>]           whether a cached pattern exists — the deterministic
                                          existence probe every knowledge-gated lane runs first
                                          (exit 1 when <lang> absent; no arg lists all cached)
  orc gotcha [--dir <path>]               repair memory — what this project already got wrong
                                          (project-scoped; no --global)
    orc gotcha status | list              whether any live entry exists — the deterministic probe
                                          (exit 0 = entries, 1 = none); list also prints them
    orc gotcha prune                      archive the low-value tail (fewest hits, then oldest)
                                          down to gotchas_max → gotchas-archive.md; never deletes
  orc mock [--dir <path>]                 mocked runnable examples left by a green verify
                                          (project-scoped; no --global) — read-only, never runs one
    orc mock list [--json]                every mock-examples/<slug>/, newest first
    orc mock show <slug> [--json]         EXAMPLE.md + the file tree for one example
  orc mock-run                            MOCKED RUNS — a written walkthrough per lane: what you
                                          type, what ORC prints, what lands on disk. Ships with
                                          the package, so it needs no project (a different thing
                                          from orc mock above)
    orc mock-run list [--json]            every walkthrough, grouped in reading order
    orc mock-run show <slug> [--json]     read one (also: orc mock-run <slug>)
  orc pr [--dir <path>]                   stacked pull requests (project-scoped; no --global)
    orc pr stack template [<slug>]        write a fill-in stack-plan skeleton to
                                          stacked-pr/<slug>/stack-plan.md — fill it in and start
                                          straight at /orc-pr-driver (no planner run needed)
    orc pr stack status [<slug>]          is a stack plan READY? (exit 0 ready /
                                          1 absent-or-unfilled) — the probe the driver runs first
                                          (aliases: orc pr-stack-template, orc pr-stack-status)
  orc resume [<n>|<slug>]                 runs waiting for you — numbered list, pick one, and it
                                          prints (and copies) the paste-into-a-fresh-session prompt
                                          (exit 0 = something is waiting, 1 = nothing is)
                                          [--no-clipboard]  print only, never touch the clipboard
  orc run list [--all|--limit <n>]        every run, newest first, with status
                                          waiting | finished | incomplete  [--json]
    orc run show <slug|n>                 one run: state-of-play, resume prompt, checkpoint
  orc stats [--since YYYY-MM-DD] [--json] how much you actually use each lane and agent, counted
                                          from the trace filenames — no model, instant, free
  orc onboarding [<topic>]                guided walkthrough (menu on a TTY; prints all when piped)
                                          topics: overview, install, first-run, lanes,
                                          config, knowledge, upgrade, troubleshooting
  orc where [--global | --dir <path>]     show target paths
  orc doctor [--global | --dir <path>]    read-only health report: version skew, orphaned/missing
                                          payload files, settings.json wiring, trace pointer, diy lock
    orc doctor --fix                      apply the fixes (= update + prune + settings re-merge)
    orc doctor --json                     the same findings as ONE JSON object on stdout (no banner,
                                          no colour) — same exit code as the human report (0/1)
  orc ui [--dir <path>]                   local web control panel for everything in ORC that is
                                          NOT ai — settings, health, runs, knowledge, stats, mock
                                          examples. Binds 127.0.0.1:${UI_DEFAULT_PORT} and opens a browser.
                                          It never runs a lane and never calls a model.
                                          [--port <n>]   pick the port (no auto-walk when explicit)
                                          [--no-open]    print the URL instead of opening it
                                          [--idle <min>] shut down after N idle minutes (0 = never)
                                          [--fixtures]   canned data, no project needed
                                          [--stop]       stop this project's server (exit 0 stopped
                                                         / 1 nothing was running)
  orc version                             print installed version + check for a newer one
  orc changelog                           what you would GET by upgrading (entries newer than yours)
  orc --help

Machine-readable output:
  --json is accepted by config list | config profile | config recommend | where |
  version | changelog | doctor | wiki status | wiki impact | wiki plan | wiki debt |
  wiki usage | pattern status | gotcha list | crosslink list | crosslink status |
  crosslink kinds | diy show | diy status | run list | run show | stats |
  pr stack status | mock list | mock show | mock-run list | mock-run show |
  pact status | pact check |
  boundary status | handoff surfaces | handoff set | budget forecast |
  budget actual | budget rates | aftermath status | export [--check] | export import |
  challenge list | challenge status | challenge show | challenge diff | challenge expect |
  challenge lint | challenge outline | challenge record | challenge report |
  doc list | doc status | doc show | doc map | doc plan | doc outline | doc lint |
  doc templates | doc targets.
  It prints ONE object to stdout and keeps the command's normal exit code.

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
    case "gotcha":
      gotcha();
      break;
    case "mock":
      mock();
      break;
    // Package content, not project state — hence a separate command from `mock`
    // above, which reads mock-examples/ inside the user's repo.
    case "mock-run":
    case "mockrun":
      mockRun();
      break;
    // v0.46.0 — the six new lanes' deterministic halves. Every one is a READ
    // with an exit-code contract (plus the two sanctioned writes: `pact check`
    // re-anchors what passes, `handoff set` edits one graded surface).
    case "pact":
      pact();
      break;
    case "boundary":
      boundary();
      break;
    case "handoff":
      handoff();
      break;
    case "budget":
      budget();
      break;
    case "aftermath":
      aftermath();
      break;
    case "export":
      exportCmd();
      break;
    // v0.47.0 — the lane that refuses to produce. Every subcommand is a READ
    // with an exit-code contract except `init`, `record`, `accept`, `rebut`,
    // `template`, `goals` and `report`, which are the ledger's only writers.
    case "challenge":
      challenge();
      break;
    // v0.48.0 — the lane that writes the long document. Every subcommand is a
    // READ with an exit-code contract except `init`, `outline --set`, `extract`,
    // `splice` and `assemble`, which are doc.json's only writers.
    case "doc":
      doc();
      break;
    case "ui":
      uiCmd();
      break;
    case "pr":
    case "pr-stack-template":
    case "pr-stack-status":
      pr(cmd);
      break;
    case "resume":
      resume();
      break;
    case "run":
      runCmd();
      break;
    case "stats":
      stats();
      break;
    case "where":
      where();
      await maybeNudge();
      break;
    case "onboarding":
      onboarding();
      break;
    case "doctor":
      doctor();
      break;
    case "version":
    case "--version":
    case "-v":
      await version();
      break;
    case "changelog":
      await changelog();
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
