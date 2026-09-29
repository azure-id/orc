#!/usr/bin/env node
"use strict";

/**
 * ORC statusline — THE WEATHER FETCHER. (v2.0.4)
 *
 * The status-line hook starts this DETACHED and never waits for it:
 *   node orc-weather-fetch.js <orcDir> <location> <metric|us>
 * It asks wttr.in once, writes `<orcDir>/weather.json` atomically (a temp file,
 * then a rename) and deletes `<orcDir>/weather.lock`. Any error deletes the
 * lock and exits quietly: the old cache stays as it was. It never prints.
 * Zero dependencies.
 */

const SUN = [113];
const PARTLY = [116];
const CLOUD = [119, 122];
const FOG = [143, 248, 260];
const STORM = [200, 386, 389, 392, 395];
const RAIN = [176, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314, 353, 356, 359];
const SNOW = [179, 182, 185, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377];

// wttr.in weatherCode → one of the `weather-icon` states. An unknown code is
// fog when the description names haze/smoke/mist/fog/dust/sand/ash, else cloud.
function stateOf(code, desc) {
  const n = Number(code);
  if (!Number.isFinite(n)) return null;
  if (SUN.includes(n)) return "sun";
  if (PARTLY.includes(n)) return "partly";
  if (CLOUD.includes(n)) return "cloud";
  if (FOG.includes(n)) return "fog";
  if (STORM.includes(n)) return "storm";
  if (SNOW.includes(n)) return "snow";
  if (RAIN.includes(n)) return "rain";
  if (/haze|smoke|mist|fog|dust|sand|ash/i.test(String(desc || ""))) return "fog";
  return "cloud";
}

// A provider string is printed to a terminal: no control characters (an ESC
// is a terminal-escape injection), at most 24 characters.
function clean(s) {
  if (s == null) return null;
  const t = [...String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, "")].slice(0, 24).join("").trim();
  return t || null;
}

function numOr(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

// The pure half: a parsed wttr.in `j1` body → the cache record, or null.
function record(body, now) {
  const cur = body && Array.isArray(body["current_condition"]) ? body["current_condition"][0] : null;
  if (!cur) return null;
  const desc = Array.isArray(cur.weatherDesc) && cur.weatherDesc[0] ? cur.weatherDesc[0].value : null;
  return {
    at: now,
    temp_c: numOr(cur.temp_C),
    temp_f: numOr(cur.temp_F),
    state: stateOf(cur.weatherCode, desc),
    desc: clean(desc),
  };
}

function main(argv) {
  const fs = require("fs");
  const path = require("path");
  const orcDir = argv[0];
  if (!orcDir) return;
  const lockFile = path.join(orcDir, "weather.lock");
  const drop = () => {
    try {
      fs.unlinkSync(lockFile);
    } catch (_) {}
  };
  try {
    const loc = String(argv[1] || "").replace(/[\u0000-\u001f\u007f-\u009f]/g, "").slice(0, 40);
    const url = "https://wttr.in/" + encodeURIComponent(loc) + "?format=j1";
    const req = require("https").get(url, { headers: { "User-Agent": "orc-statusline" }, timeout: 6000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        drop();
        return;
      }
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        raw += c;
        if (raw.length > 1e6) req.destroy();
      });
      res.on("end", () => {
        try {
          const rec = record(JSON.parse(raw), Date.now());
          if (rec) {
            const out = path.join(orcDir, "weather.json");
            const tmp = out + "." + process.pid + ".tmp";
            fs.writeFileSync(tmp, JSON.stringify(rec) + "\n");
            fs.renameSync(tmp, out);
          }
        } catch (_) {}
        drop();
      });
      res.on("error", drop);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", drop);
  } catch (_) {
    drop();
  }
}

if (require.main === module) {
  process.on("uncaughtException", () => {
    try {
      require("fs").unlinkSync(require("path").join(process.argv[2] || ".", "weather.lock"));
    } catch (_) {}
    process.exit(0);
  });
  main(process.argv.slice(2));
}

module.exports = { stateOf, clean, record };
