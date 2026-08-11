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
  budget actual | budget rates | aftermath status | export [--check] | export import.
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
