"use strict";
// wiki-core — the data half of `orc wiki`: registration, freshness, status,
// usage and resolve. Moved from bin/cli.js in ORC 2.3.0 so Light ORC can copy it;
// behaviour unchanged. bin/cli.js keeps the printing, the arguments and the exit
// codes, and gives the two deps below through configure().

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// deps come from the caller. Each one is a function, read at call time only.
let deps = {};
function configure(d) {
  deps = d;
}
function repoRootOf(claudeDir) {
  return deps.repoRootOf(claudeDir);
}
function readOverride(claudeDir) {
  return deps.readOverride(claudeDir);
}

// Private copies of small pure cli.js helpers. bin/cli.js keeps its own.
const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + "s"}`;
const GIT_MAX_BUFFER = 256 * 1024 * 1024;
function gitIn(root, argv) {
  const r = spawnSync("git", argv, { cwd: root, encoding: "utf8", maxBuffer: GIT_MAX_BUFFER });
  if (r.error || r.status !== 0 || !r.stdout) return null;
  return r.stdout.trim();
}
const two = (n) => String(n).padStart(2, "0");
const fmtStamp = (d) =>
  `${two(d.getDate())}-${two(d.getMonth() + 1)}-${d.getFullYear()} ` +
  `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;

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

// Minimal frontmatter reader — the exact subset schemas/wiki-doc.md uses:
// scalars, inline arrays (`covers: [a, b]`), one nested map level
// (`covered_files:` + indented `path: hash`), and — v2.1.2 (F02) — YAML block
// lists (`checklist:` then `- item` lines, indented or not), the shape the
// boundary card reference shows. No YAML dep, by house rule.
function stripComment(val) {
  // ` # …` ends a value only OUTSIDE quotes.
  let q = null;
  for (let i = 0; i < val.length; i++) {
    const ch = val[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === "#" && i > 0 && /\s/.test(val[i - 1])) return val.slice(0, i).trim();
  }
  return val.trim();
}
function splitInline(body) {
  // `a, "b, c", 'd'` → ["a", "b, c", "d"] — a comma inside quotes is text.
  const out = [];
  let cur = "";
  let q = null;
  for (const ch of body) {
    if (q) { if (ch === q) q = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => unquote(s)).filter(Boolean);
}
function parseDocHeader(text) {
  const m = text.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const h = {};
  let openKey = null; // a key with an empty value: a map or a list follows
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (openKey && /^\s*-(\s|$)/.test(raw)) {
      if (!Array.isArray(h[openKey])) h[openKey] = []; // the first `- ` makes it a list
      const v = unquote(stripComment(raw.replace(/^\s*-\s*/, "")));
      if (v) h[openKey].push(v);
      continue;
    }
    if (/^\s+\S/.test(raw) && openKey && !Array.isArray(h[openKey])) {
      const kv = stripComment(raw.trim()).match(/^(.+?):\s*(.*)$/);
      if (kv) h[openKey][unquote(kv[1])] = unquote(kv[2]);
      continue;
    }
    const kv = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    openKey = null;
    const key = kv[1];
    const val = stripComment(kv[2]);
    if (val === "") { h[key] = {}; openKey = key; continue; }
    if (val.startsWith("[")) { h[key] = splitInline(val.replace(/^\[|\]$/g, "")); continue; }
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

// ── `--json is not a summary` (v0.49.1) ────────────────────────────────────
// The rule this release adds, and it is a rule no contract lint can enforce:
//
//   A read's `--json` is the WHOLE computed object, not a summary. A field the
//   human path prints and the JSON omits is drift — and it is drift no lint can
//   see, because both halves live in one function.
//
// `wikiStatus`'s TTY branch printed the per-doc tier counts, the worst doc's
// FILENAME (the thing actually pinning the tier), the top five stale docs with
// their own distances and the crosslink boundary state. `--json` emitted five
// scalars and a COUNT. The panel therefore could not be as detailed as the
// terminal, no matter how it was written.
function wikiStatusDetail(claudeDir, paths, s, f) {
  const counts = { FRESH: 0, AGING: 0, STALE: 0, unknown: 0 };
  for (const r of f.perDoc) counts[r.tier]++;
  const meta = s.meta || {};
  const byFile = new Map((Array.isArray(meta.docs) ? meta.docs : []).map((d) => [d.file, d]));
  const usage = readWikiUsage(claudeDir);
  const provided = readCrosslinkProvided(paths);
  // A tag carries no "source doc" field, so per-doc tag counts are derived the
  // one honest way available: COVERAGE-RELATIVE. A tag belongs to the doc(s)
  // that cover the file its `anchor` names — the same relation `docCovers`
  // already defines everywhere else. A tag with no resolvable anchor belongs to
  // no doc and is counted in `crosslink.provided` only. Nothing is guessed.
  const tagsPerDoc = new Map();
  for (const t of provided.list || []) {
    const file = String((t && t.anchor) || "").split(":")[0].trim();
    if (!file) continue;
    for (const d of Array.isArray(meta.docs) ? meta.docs : [])
      if (docCovers(d, file)) tagsPerDoc.set(d.file, (tagsPerDoc.get(d.file) || 0) + 1);
  }
  const onDisk = readWikiDocs(paths.wikiDir).docs;
  const titleOf = (file) => {
    const hit = onDisk.find((d) => d.rel === file);
    if (!hit) return null;
    const h = hit.header || {};
    if (h.title) return String(h.title);
    const m = hit.text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : null;
  };
  const worstRow = f.perDoc.find((r) => r.distance === f.distance && r.anchor === f.anchor) || null;
  const orientationFile = (Array.isArray(meta.docs) ? meta.docs : []).find((d) => /orc-orientation\.md$/.test(d.file));
  return {
    counts,
    // The doc pinning the tier, BY NAME. Today the user is told a hash instead,
    // and a hash is not a thing anybody can go and refresh.
    worst: worstRow ? { file: worstRow.file, distance: worstRow.distance, anchor: worstRow.anchor } : null,
    per_doc: f.perDoc.map((r) => {
      const entry = byFile.get(r.file) || {};
      const u = usageFor(usage, r.file);
      return {
        file: r.file,
        title: titleOf(r.file),
        tier: r.tier,
        distance: r.distance,
        anchor: r.anchor,
        scanned_commit: entry.scanned_commit || null,
        doc_type: entry.doc_type || null,
        covers: entry.covers || [],
        covered_files: Object.keys(entry.covered_files || {}).length,
        crosslink_tags: tagsPerDoc.get(r.file) || 0,
        // `used: null` is NOT zero-use (the wiki plan rule): unknown must never
        // be ranked, or reported, as dead.
        used: usage ? (u ? u.used : 0) : null,
        used_of: usage ? usage.window_runs || WIKI_USAGE_RUNS : null,
        last_used: u && u.last_used ? String(u.last_used).slice(0, 10) : null,
        retire_hint: !!(usage && u && u.used === 0),
      };
    }),
    // The FILES, not a count. `blind: 2` tells a user nothing they can act on.
    blind_spot: f.blind,
    orientation: orientationFile
      ? { present: true, file: orientationFile.file, scanned_commit: orientationFile.scanned_commit || null }
      : { present: false, file: "wiki/orc-orientation.md", regenerate: "/orc-wiki refresh wiki/orc-orientation.md" },
    crosslink: {
      provided: (provided.list || []).length,
      boundary_rows: countBoundaryRows(onDisk),
      state:
        (provided.list || []).length > 0
          ? "PUBLISHED"
          : countBoundaryRows(onDisk) > 0
            ? "UNPUBLISHED"
            : "NONE",
    },
    // Reused VERBATIM from `wiki plan`, because a user must never be able to pay
    // for what a free step fixes — and today that list exists only inside `plan`.
    free_repairs: freeRepairs(claudeDir, { state: s.state, docs: Array.isArray(meta.docs) ? meta.docs : [] }),
  };
}

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

const WIKI_USAGE_FILE = "wiki-usage.json";
// How many recent runs the usage window covers. Not a config key: the number is
// the DENOMINATOR printed next to every count ("17/20"), so a user-tunable
// value would make two machines disagree about what "used" means while showing
// the same-looking fraction.
const WIKI_USAGE_RUNS = 20;

function wikiUsagePath(claudeDir) {
  return path.join(claudeDir, "orc", WIKI_USAGE_FILE);
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

const WIKI_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "at", "is", "it",
  "this", "that", "with", "our", "my", "we", "i", "add", "need", "want", "please",
  "feature", "features", "page", "doc", "docs", "wiki", "about", "new", "some",
  "how", "what", "where", "why", "can", "you", "me", "us", "thing", "things",
]);

const wikiTerms = (topic) =>
  [...new Set(String(topic || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !WIKI_STOPWORDS.has(w)))];

// A doc is scored on the fields a HUMAN would look at, weighted by how
// deliberate each one is. `keywords` exist precisely so a request can be
// matched to a page, so they weigh most; a glob in `covers` is the loosest
// signal and weighs least.
function wikiScoreDoc(row, terms) {
  const hay = {
    keywords: (row.keywords || []).join(" ").toLowerCase(),
    title: String(row.title || "").toLowerCase(),
    area: String(row.area || "").toLowerCase(),
    file: String(row.file || "").toLowerCase(),
    covers: (row.covers || []).join(" ").toLowerCase(),
  };
  const W = { keywords: 4, title: 3, area: 3, file: 2, covers: 1 };
  let score = 0;
  const why = [];
  for (const t of terms)
    for (const [field, text] of Object.entries(hay))
      if (text.includes(t)) {
        score += W[field];
        why.push(`${t} in ${field}`);
        break; // one field per term — a term is evidence once, not five times
      }
  return { score, why };
}

// Cheap, deterministic scope proposal for a NEW doc: paths whose own name
// carries a topic term. It is a STARTING POINT for the user to correct, never
// an answer — which is why it is capped and labelled as a proposal.
function wikiSuggestPaths(root, terms) {
  if (!terms.length) return [];
  const raw = gitIn(root, ["ls-files"]);
  const all = raw ? String(raw).split("\n").map((x) => x.trim()).filter(Boolean) : [];
  if (!all.length) return [];
  const dirs = new Map();
  const files = [];
  for (const f of all) {
    const low = f.toLowerCase();
    if (!terms.some((t) => low.includes(t))) continue;
    files.push(f);
    const d = f.split("/").slice(0, -1).join("/");
    if (d) dirs.set(d, (dirs.get(d) || 0) + 1);
  }
  // Prefer a directory that holds several matches over the files themselves:
  // a coverage area is a place, not a list.
  const top = [...dirs.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const out = top.map(([d, n]) => ({ glob: d + "/**", matches: n }));
  for (const f of files.slice(0, 6))
    if (!out.some((o) => f.startsWith(o.glob.replace(/\*\*$/, "")))) out.push({ glob: f, matches: 1 });
  return out.slice(0, 8);
}

// The data half of `orc wiki sync`: compare the built registration with the
// files on disk and compute the crosslink alarms. bin/cli.js prints the result.
function wikiSyncPlan(claudeDir, r) {
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
  return { before, nextMeta, changed, boundaryUnpublished, n0trip, tagsLost, crosslinkAlarm };
}

// The ONE write of `orc wiki sync`: the manifest and the INDEX.
function wikiSyncWrite(r, nextMeta) {
  fs.mkdirSync(path.dirname(r.paths.meta), { recursive: true });
  fs.writeFileSync(r.paths.meta, nextMeta);
  fs.writeFileSync(r.paths.index, r.index);
}

// The `orc wiki status --json` object. bin/cli.js prints it and exits 0.
function wikiStatusJson(claudeDir, s, paths) {
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
    // v0.49.1 — `--json is not a summary`. Every legacy key above keeps its
    // name, its position and its meaning (`orc doctor`, the overview tile and
    // `_shared/detecting-artifacts.md` all read them); everything below is
    // ADDITIVE, and it is the same object the TTY branch has been printing all
    // along. A field the human path prints and the JSON omits is drift no lint
    // can see, because both halves live in one function.
    Object.assign(out, wikiStatusDetail(claudeDir, paths, s, f));
  }
  return out;
}

// The data half of `orc wiki resolve`. Returns `{ st }` when there is no wiki or
// the manifest is corrupt; else the scored match. bin/cli.js prints the result.
function wikiResolve(claudeDir, topic) {
  // The doc HEADERS, not the freshness rows: `keywords` and `area` are the two
  // fields a topic actually matches on, and neither survives into per_doc.
  const paths = wikiPaths(claudeDir);
  const st = wikiState(claudeDir);
  if (st.state === "none" || st.state === "corrupt") return { st };
  const { docs } = readWikiDocs(paths.wikiDir);

  const terms = wikiTerms(topic);
  const scored = docs
    .map((d) => {
      const row = {
        file: d.rel,
        area: d.header.area || null,
        title: (d.text.match(/^#\s+(.+)$/m) || [])[1] || null,
        keywords: Array.isArray(d.header.keywords) ? d.header.keywords : [],
        covers: Array.isArray(d.header.covers) ? d.header.covers : [],
      };
      return { ...row, ...wikiScoreDoc(row, terms) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored[0] || null;
  const second = scored[1] || null;
  // A clear winner needs to beat the runner-up, not merely lead it. Two docs a
  // point apart is the case where guessing costs a scan of the wrong area.
  let verdict = "new";
  if (top && (!second || top.score >= second.score * 1.5 + 1)) verdict = "match";
  else if (top) verdict = "ambiguous";

  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const payload = {
    ok: true,
    topic,
    terms,
    verdict,
    match: verdict === "match" ? top : null,
    candidates: scored.slice(0, 5),
    suggested_slug: slug,
    suggested_covers: verdict === "new" ? wikiSuggestPaths(paths.root, terms) : [],
    next:
      verdict === "match"
        ? `/orc-wiki update ${top.file}`
        : verdict === "ambiguous"
          ? "ask which doc this belongs to — two or more cover it about equally"
          : `/orc-wiki add "${topic}"`,
    note: "the suggested covers are a STARTING POINT derived from path names, never an answer — the user corrects them before anything is scanned.",
  };
  const code = verdict === "match" ? 0 : verdict === "new" ? 1 : 2;
  return { terms, verdict, scored, top, payload, code };
}

module.exports = {
  configure,
  wikiPaths,
  parseDocHeader,
  readWikiDocs,
  docDescription,
  oldestCommit,
  freshnessTier,
  TIER_RANK,
  coveragePathspecs,
  wikiFreshnessEdges,
  computeWikiFreshness,
  parseScannedAt,
  detectCommands,
  readCrosslinkProvided,
  countBoundaryRows,
  readMetaAt,
  buildRegistration,
  wikiState,
  wikiSyncPlan,
  wikiSyncWrite,
  wikiStatusJson,
  wikiStatusDetail,
  impactGlobRe,
  docCovers,
  IMPACT_NOISE,
  WIKI_USAGE_FILE,
  WIKI_USAGE_RUNS,
  wikiUsagePath,
  readWikiUsage,
  usageFor,
  freeRepairs,
  WIKI_STOPWORDS,
  wikiTerms,
  wikiScoreDoc,
  wikiSuggestPaths,
  wikiResolve,
};
