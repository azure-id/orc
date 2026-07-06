"use strict";
/**
 * ORC update-check helper — shared by the ORC hooks (orc-effort-guard.js,
 * orc-statusline.js). Surfaces a "newer version available" nudge INSIDE Claude
 * Code (when you invoke /orc, and on the statusline) without any model tokens —
 * hooks are deterministic scripts Claude Code runs, not model turns.
 *
 * How it knows versions:
 *  - installed version: `.claude/hooks/orc-version.json` (stamped by `orc init`/
 *    `update`/`upgrade` at install time).
 *  - latest version: the source's main package.json, fetched over HTTPS and
 *    cached 24h in ~/.orc-update-check.json (the SAME cache the CLI uses).
 *
 * Fail-silent everywhere: no network, bad JSON, or missing files → no nudge,
 * never throws. Opt out with ORC_NO_UPDATE_CHECK=1 (also off under CI).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const UPDATE_URL =
  process.env.ORC_VERSION_URL ||
  "https://raw.githubusercontent.com/azure-id/orc/main/package.json";
const CACHE_FILE = path.join(os.homedir(), ".orc-update-check.json");
const TTL_MS = 24 * 60 * 60 * 1000;

const disabled = () =>
  process.env.ORC_NO_UPDATE_CHECK === "1" || process.env.CI === "true";

function installedVersion(hooksDir) {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(hooksDir, "orc-version.json"), "utf8"))
        .version || null
    );
  } catch (_) {
    return null;
  }
}

function parseSemver(v) {
  const m = String(v || "").trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function semverGt(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch (_) {
    return null;
  }
}
function writeCache(o) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(o));
  } catch (_) {}
}

const nudgeText = (latest, cur) =>
  `⬆ orc ${latest} available (you have ${cur || "?"}) — run \`orc upgrade\``;

// Instant, cache-only (no network). For the statusline hot path. → string|null.
function readCachedNudge(cur) {
  if (disabled()) return null;
  const c = readCache();
  return c && c.latest && semverGt(c.latest, cur) ? nudgeText(c.latest, cur) : null;
}

// Cache-first, refreshes over HTTPS only when the cache is >24h old. Bounded
// (1.2s) and fail-silent. For the PreToolUse guard (fires on /orc invoke, so a
// once-a-day sub-second refresh is fine). Calls cb(string|null).
function refreshAndNudge(cur, cb) {
  if (disabled()) return cb(null);
  const c = readCache();
  if (c && Date.now() - (c.checkedAt || 0) < TTL_MS) {
    return cb(c.latest && semverGt(c.latest, cur) ? nudgeText(c.latest, cur) : null);
  }
  let done = false;
  const finish = (latest) => {
    if (done) return;
    done = true;
    const l = latest || (c ? c.latest : null);
    writeCache({ checkedAt: Date.now(), latest: l });
    cb(l && semverGt(l, cur) ? nudgeText(l, cur) : null);
  };
  try {
    const https = require("https");
    const req = https.get(
      UPDATE_URL,
      { headers: { "User-Agent": "orc-hook" } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return finish(null);
        }
        let s = "";
        res.on("data", (ch) => (s += ch));
        res.on("end", () => {
          try {
            finish(JSON.parse(s).version);
          } catch (_) {
            finish(null);
          }
        });
      }
    );
    req.on("error", () => finish(null));
    req.setTimeout(1200, () => {
      req.destroy();
      finish(null);
    });
  } catch (_) {
    finish(null);
  }
}

module.exports = { installedVersion, readCachedNudge, refreshAndNudge };
