"use strict";
// v2.3.0 W5a — the bridge to Light ORC (lorc). ORC never reads lorc's files
// except the version stamp: every other answer comes from lorc's own CLI, so
// lorc owns its formats and ORC keeps no copy that can drift.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const VERSION_TIMEOUT_MS = 5000;
const CALL_TIMEOUT_MS = 15000;

function readStamp(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
    if (!j || typeof j !== "object") return null;
    return { path: file, version: typeof j.version === "string" ? j.version : null, cli: typeof j.cli === "string" ? j.cli : null };
  } catch (_) {
    return null;
  }
}

// Run `node <cli> <args> --json --dir <root>` and parse stdout as ONE object.
// Returns { ok:true, data, status, stderr } or { ok:false, state:"UNREADABLE", detail, status, stderr }.
function call(cli, args, root, timeoutMs) {
  const r = spawnSync(process.execPath, [cli, ...(args || []), "--json", "--dir", root], {
    timeout: timeoutMs || CALL_TIMEOUT_MS,
    windowsHide: true,
    encoding: "utf8",
  });
  const stderr = String(r.stderr || "");
  const status = typeof r.status === "number" ? r.status : null;
  if (r.error && r.error.code === "ETIMEDOUT") return { ok: false, state: "UNREADABLE", detail: "timeout", status, stderr };
  if (r.signal && status === null) return { ok: false, state: "UNREADABLE", detail: "timeout", status, stderr };
  const out = String(r.stdout || "").trim();
  try {
    const data = JSON.parse(out);
    if (data === null || typeof data !== "object") throw new Error("not an object");
    return { ok: true, data, status, stderr };
  } catch (_) {
    return { ok: false, state: "UNREADABLE", detail: (out || stderr.trim()).slice(0, 200), status, stderr };
  }
}

// Detection: the two version stamps, project first, then global.
function detect(root, home, opts) {
  const o = opts || {};
  const project = readStamp(path.join(root, ".claude", "lorc", "version.json"));
  const global = home ? readStamp(path.join(home, ".claude", "lorc", "version.json")) : null;
  const installed = project && global ? "both" : project ? "project" : global ? "global" : "none";
  const cli = (project && project.cli) || (global && global.cli) || null;
  let cli_ok = false;
  let version = null;
  if (cli && fs.existsSync(cli)) {
    const r = call(cli, ["version"], root, o.versionTimeoutMs || VERSION_TIMEOUT_MS);
    if (r.ok) {
      cli_ok = true;
      version = typeof r.data.version === "string" ? r.data.version : null;
    }
  }
  return { installed, project, global, cli, cli_ok, version };
}

// `orc lorc <sub>` → the lorc argv. null = not a known subcommand.
function mapArgs(sub, rest, opts) {
  const o = opts || {};
  const lim = o.limit != null ? ["--limit", String(o.limit)] : [];
  switch (sub) {
    case "runs":
      return ["run", "list", ...lim];
    case "run":
      return rest[0] ? ["run", "show", rest[0]] : null;
    case "stats":
      return ["stats", ...lim];
    case "settings":
      if (rest[0] === "set") return rest[1] != null && rest[2] != null ? ["settings", "set", rest[1], rest[2], ...(o.global ? ["--global"] : [])] : null;
      return ["settings"];
    case "habits":
      if (rest[0] === "accept" || rest[0] === "decline") return rest[1] ? ["habits", rest[0], rest[1]] : null;
      return ["habits"];
    case "usage":
      return ["usage"];
    case "graph":
      return ["graph", "where"];
    case "doctor":
      return ["doctor"];
    case "version":
      return ["version"];
    case "changelog":
      return ["changelog"];
    default:
      return null;
  }
}

const SUBCOMMANDS = ["status", "runs", "run", "stats", "settings", "habits", "usage", "graph", "doctor", "version", "changelog"];

module.exports = { detect, call, mapArgs, SUBCOMMANDS, VERSION_TIMEOUT_MS, CALL_TIMEOUT_MS };
