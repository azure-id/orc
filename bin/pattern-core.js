"use strict";
// pattern-core — the data half of `orc pattern status` and `orc pattern show`.
// Moved from bin/cli.js in ORC 2.3.0 so Light ORC can copy it; behaviour
// unchanged. bin/cli.js keeps the printing and the exit codes.

const fs = require("fs");
const path = require("path");

// deps come from the caller. Each one is a function, read at call time only.
let deps = {};
function configure(d) {
  deps = d;
}
function parseDocHeader(text) {
  return deps.parseDocHeader(text);
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
    path.join(deps.srcSkills(), "orc-pattern", "references"),
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

// The `orc pattern status --json` object and its exit code (the data half of
// patternStatus in bin/cli.js, which prints it).
function patternStatusData(claudeDir, lang) {
  const langs = listPatternLangs(claudeDir);
  const known = knownPatternLangs(claudeDir);
  const unknown = !!(lang && known.length && !known.includes(lang));
  const cached = lang ? langs.includes(lang) : langs.length > 0;
  const obj = {
    lang: lang || null,
    cached,
    unknown_language: unknown,
    patterns_dir: patternsDir(claudeDir),
    patterns: patternEntries(claudeDir),
    known_languages: known,
  };
  const code = unknown ? 2 : cached ? 0 : 1;
  return { obj, code };
}

// The `orc pattern show` payload, read from the file text (the data half of
// patternShow in bin/cli.js, which prints it).
function patternShowPayload(lang, file, text, wantBody) {
  const header = parseDocHeader(text);
  const body = text.replace(/^﻿/, "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const headings = body
    .split(/\r?\n/)
    .filter((l) => /^#{2,3}\s+\S/.test(l))
    .map((l) => l.replace(/^#+\s+/, "").trim());
  // Counted from the file's own vocabulary — never inferred, never a judgment.
  const countOf = (re) => (body.match(re) || []).length;
  const conflicts = body
    .split(/\r?\n/)
    .filter((l) => /\bCONFLICT\b/i.test(l))
    .map((l) => l.replace(/^[-*>\s]+/, "").trim());
  let stat = null;
  try {
    stat = fs.statSync(file);
  } catch (_) {}
  const payload = {
    ok: true,
    lang,
    path: file,
    // `headered: false` is the honest answer, and `codified_at` stays null with
    // it. An mtime is when the FILE moved, not when the pattern was codified.
    headered: !!header,
    codified_at: header && header.codified_at ? header.codified_at : null,
    source_commit: header && header.source_commit ? header.source_commit : null,
    playbook: header && header.playbook ? header.playbook : null,
    headings,
    conventions: countOf(/\bCONVENTION\b/gi),
    invariants: countOf(/\bINVARIANT\b/gi),
    conflicts,
    bytes: Buffer.byteLength(text, "utf8"),
    lines: text.split(/\r?\n/).length,
    mtime_ms: stat ? Math.round(stat.mtimeMs) : null,
    ...(wantBody ? { body: text } : {}),
    ...(header
      ? {}
      : {
          header_note:
            "this pattern file carries no parseable header — reported as it is on disk; a codified-at date is never derived from the file's mtime",
        }),
  };
  return { payload, header, headings, conflicts };
}

module.exports = {
  configure,
  patternsDir,
  listPatternLangs,
  knownPatternLangs,
  patternEntries,
  patternStatusData,
  patternShowPayload,
};
