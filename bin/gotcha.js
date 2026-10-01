"use strict";
// ── `orc gotcha` v2 — the gotchas engine (v2.0.0 W4) ────────────────────────
//
// v1 had the MODEL assign ids, dedupe and match. v2 moves all three to this
// module, and adds a raw layer the promotion is COMPUTED from:
//
//   .claude/orc/gotchas.md            the ledger — the v1 format, plus 9 optional
//                                     fields in a fixed order (`source:` and the rest)
//   .claude/orc/gotchas-archive.md    evicted entries (bin/cli.js `prune`, unchanged)
//   .claude/orc/observations.jsonl    one line per observed event, append-only,
//                                     written by THIS module only
//
// None is in the install manifest (`isPrunable` matches only skills/, commands/,
// agents/, hooks/), so `orc update`, `--prune` and `doctor --fix` never touch them.
//
// The heading is UNCHANGED (`GOTCHA_HEAD` in bin/cli.js, kind ∈ repair|drift|
// review|verify): a 1.x CLI must still parse a 2.0 file. The new information
// rides in the optional `source:` field (DE-9). Review learning is ALWAYS ON
// (DE-10): `card` has no off answer, and `gotcha_card_budget` is a SIZE.
//
// Routed by bin/cli.js (`orc gotcha add|match|card|filter|observe|list
// --candidates|accept|quality|why|export`). The v1 reads (`status`, `list`,
// `show`, `prune`) stay in bin/cli.js, unchanged.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

// ── The vocabularies (DATA) ─────────────────────────────────────────────────
const KINDS = ["repair", "drift", "review", "verify"];
// `source` → the `kind` it is filed under (`05` §2.2). A v1 entry has no
// `source:` line; its source is its kind.
const SOURCE_KIND = {
  repair: "repair",
  drift: "drift",
  review: "review",
  verify: "verify",
  defect: "repair",
  ci: "repair",
  pr: "review",
  sonar: "review",
  sarif: "review",
  dismissal: "review",
};
const V1_SOURCES = ["repair", "drift", "review", "verify"];
// An in-lane red → green with a reproduction promotes at once (`05` §4 (a)).
const IN_LANE_SOURCES = ["repair", "drift", "review", "verify", "defect", "ci"];
const CATEGORIES = [
  "functional.logic",
  "functional.check",
  "functional.interface",
  "functional.resource",
  "functional.timing",
  "functional.build",
  "security",
  "evolvability.structure",
  "evolvability.documentation",
  "evolvability.visual",
  "test",
];
const SEVERITIES = ["P0", "P1", "P2", "P3"];
const POLARITIES = ["flag", "suppress"];
const OUTCOMES = ["addressed", "open", "disputed", "wontfix", "flaky"];
const AUTHORS = ["human", "bot", "orc"];
// v2.1.0 §4.2 — a FIX record (`orc fix record`). `introduced_by` is who wrote
// the bad lines; `cause` is a REQUIRED ledger field already, so it is not reused.
const INTRODUCED_BY = ["orc", "ai", "human", "unknown"];
const FIX_VIA = ["orc-fix", "orc-quick", "import"];
// The fields a fix record keeps when a later import upserts the same row.
const FIX_FIELDS = ["introduced_by", "fix_run", "via", "miss", "missed_by", "class_by", "run"];
const SCOPE_CAP = 500; // review-scope.jsonl keeps the last 500 reviews (DE-13)
// The 8 required fields, in their FIXED order (v1, unchanged) …
const REQUIRED = ["trigger", "symptom", "cause", "fix", "scope", "origin", "hits", "last_seen"];
// … then the optional ones, fixed order when present. `cwe` rides beside
// `category` for a security entry (`05` §2.3 "security (+ cwe: CWE-###)").
const OPTIONAL = ["source", "rule", "category", "cwe", "severity", "polarity", "evidence", "helpful", "harmful"];

// ── The constants a retro can move ──────────────────────────────────────────
const JACCARD_MIN = 0.6; // word 3-gram Jaccard for a `sig` match
const WINDOW_DAYS = 90; // promotion (b), quiet, the quality window
const PROMOTE_CASES = 3; // (b) distinct addressed cases …
const PROMOTE_PRS = 2; // … in this many PRs
const DO_LINE_CASES = 5; // active → "do" line in executor slices
const SUPPRESS_DISPUTES = 2; // → proposed suppression
const MATCH_CAP = 3; // executor slice (v1)
const CARD_FLAG_CAP = 6; // flag + watch lines
const CARD_WATCH_CAP = 2;
const CARD_SUPPRESS_CAP = 2;
const CARD_BUDGET_DEFAULT = 600;
const CARD_BUDGET_MIN = 200;
const P3_CAP = 5;
const NOISE_MIN_FINDINGS = 10;
const NOISE_ACCEPTANCE = 0.35;
const QUALITY_FLOOR = 5; // reviews before `quality` answers
const QUALITY_TARGET = 0.6; // the acceptance a review kind aims at (the panel's tick)
const QUALITY_SERIES = 12; // reviews in the acceptance / P3 lines
const EVIDENCE_CAP = 5;
const SIG_MAX = 120;
const DAY = 86400000;

// ── Small helpers ───────────────────────────────────────────────────────────
const sha1 = (s) => crypto.createHash("sha1").update(String(s)).digest("hex");
const p2 = (n) => String(n).padStart(2, "0");
function dmy(d) {
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}`;
}
// DD-MM-YYYY or YYYY-MM-DD[...] → ms, or NaN.
function dateMs(s) {
  const t = String(s || "");
  let m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(t);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return NaN;
}
// A UTC-midnight ms (what dateMs returns) → DD-MM-YYYY, with no zone shift.
function dmyUtc(ms) {
  const d = new Date(ms);
  return `${p2(d.getUTCDate())}-${p2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}
function isoDay(d) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
const posix = (p) => String(p || "").replace(/\\/g, "/").replace(/^\.\//, "");
const oneLine = (v) => String(v == null ? "" : v).replace(/[\r\n]+/g, " ").trim();
const estTokens = (s) => Math.ceil(String(s).length / 4);

// A glob → a RegExp. `**` crosses directories, `*` and `?` do not, `{a,b}` is
// an alternation. Paths are repo-relative with forward slashes.
function globRe(glob) {
  const g = posix(glob);
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        i++;
        if (g[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = g.indexOf("}", i);
      if (end === -1) re += "\\{";
      else {
        re += "(?:" + g.slice(i + 1, end).split(",").map((x) => x.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("|") + ")";
        i = end;
      }
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "$");
}
function inScope(scope, file) {
  if (!scope) return false;
  try {
    return globRe(scope).test(posix(file));
  } catch (_) {
    return false;
  }
}
// A glob that covers the whole repo is the unfiltered injection the v1
// contract forbids.
function wholeRepo(scope) {
  const s = posix(scope).trim();
  return !s || /^(\*\*\/?)*\*?(\.\*)?$/.test(s) || s === "**/*";
}
// Glob specificity: the literal path segments before the first wildcard.
function specificity(scope) {
  const segs = posix(scope).split("/");
  let n = 0;
  for (const s of segs) {
    if (/[*?{]/.test(s)) break;
    n++;
  }
  return 1 + n;
}

// ── `sig` — the normalized text of a finding with no rule id ────────────────
// Lower case, identifiers / numbers / code removed, max 120 chars (`05` §3).
// Secrets are redacted FIRST (§8) — a token never lands in the file.
const SECRET_RES = [
  /\b(?:bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:api[_-]?key|secret|password|passwd|token|auth)\s*[:=]\s*\S+/gi,
  /\b(?:sk|pk|ghp|gho|ghs|glpat|xox[abp])[-_][A-Za-z0-9_-]{8,}/g,
  /\bAKIA[0-9A-Z]{12,}\b/g,
  /\b[A-Za-z0-9+/_-]{32,}={0,2}/g,
];
function redact(text) {
  let t = String(text || "");
  for (const re of SECRET_RES) t = t.replace(re, " ");
  return t;
}
function normalizeSig(text) {
  let t = redact(text);
  t = t
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[A-Za-z0-9_-]+/g, " ");
  const words = t
    .split(/\s+/)
    .filter((w) => w && !/[_./\\()[\]{}<>=:;#$0-9]/.test(w.replace(/[,.!?;:]+$/, "")) && !/[a-z][A-Z]/.test(w))
    .map((w) => w.toLowerCase().replace(/[^a-z' -]/g, ""))
    .filter((w) => w && w !== "-");
  let s = words.join(" ").replace(/\s+/g, " ").trim();
  if (s.length > SIG_MAX) s = s.slice(0, SIG_MAX).replace(/\s+\S*$/, "").trim();
  return s;
}
function grams(text) {
  const w = String(text || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (w.length < 3) return new Set(w.length ? [w.join(" ")] : []);
  const out = new Set();
  for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3).join(" "));
  return out;
}
function jaccard(a, b) {
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

// ── Scope derivation (`05` §4) ──────────────────────────────────────────────
// The narrowest glob that covers every case: the file → `dir/**` → `**/*.<ext>`.
// A glob that would cover the whole repo is REFUSED, and the reason is named.
function deriveScope(paths) {
  const ps = [...new Set(paths.map(posix).filter(Boolean))];
  if (!ps.length) return { scope: null, refused: "no case carries a path" };
  if (ps.length === 1) return { scope: ps[0], refused: null };
  const dirs = ps.map((p) => p.split("/").slice(0, -1));
  const common = [];
  for (let i = 0; ; i++) {
    const seg = dirs[0][i];
    if (seg === undefined || !dirs.every((d) => d[i] === seg)) break;
    common.push(seg);
  }
  if (common.length) return { scope: common.join("/") + "/**", refused: null };
  const exts = [...new Set(ps.map((p) => (/\.([A-Za-z0-9]+)$/.exec(p) || [])[1] || ""))];
  if (exts.length === 1 && exts[0]) return { scope: `**/*.${exts[0]}`, refused: null };
  return { scope: null, refused: "the only glob that covers every case covers the whole repo" };
}

// ── The ledger (read through bin/cli.js `parseGotchas`, written here) ───────
function entryView(e) {
  const f = e.fields;
  const source = f.source && SOURCE_KIND[f.source] ? f.source : e.kind;
  const num = (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    id: e.id,
    area: e.area,
    kind: e.kind,
    source,
    rule: f.rule || null,
    category: f.category || null,
    cwe: f.cwe || null,
    severity: SEVERITIES.includes(f.severity) ? f.severity : null,
    polarity: f.polarity === "suppress" ? "suppress" : "flag",
    scope: f.scope || null,
    trigger: f.trigger || null,
    symptom: f.symptom || null,
    fix: f.fix || null,
    origin: f.origin || null,
    hits: e.hits,
    last_seen: f.last_seen || null,
    evidence: f.evidence ? f.evidence.split(/\s+·\s+/).map((x) => x.trim()).filter(Boolean) : [],
    helpful: num(f.helpful),
    harmful: num(f.harmful),
    raw: e,
  };
}
function pad(name) {
  return (name + ":").padEnd(11);
}
// Render one entry from its fields: heading, the 8 required, the optional
// ones present, then any other line the user wrote (kept, never dropped).
function renderEntry(id, area, kind, fields, extra) {
  const out = [`## ${id} · ${area} · ${kind}`];
  for (const k of REQUIRED) out.push(`- ${pad(k)}${oneLine(fields[k])}`);
  for (const k of OPTIONAL) if (fields[k] !== undefined && fields[k] !== null && String(fields[k]) !== "") out.push(`- ${pad(k)}${oneLine(fields[k])}`);
  for (const l of extra || []) out.push(l);
  return out.join("\n");
}
function extraLines(e) {
  return e.lines.slice(1).filter((l) => {
    if (!l.trim()) return false;
    const f = /^-\s+([a-z_]+):/.exec(l);
    return !(f && (REQUIRED.includes(f[1]) || OPTIONAL.includes(f[1])));
  });
}

function makeStore(claudeDir, deps) {
  const file = deps.gotchasPath(claudeDir);
  const archive = deps.gotchasArchivePath(claudeDir);
  const obsFile = path.join(claudeDir, "orc", "observations.jsonl");
  const readRaw = () => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
  function load() {
    const raw = readRaw();
    const parsed = deps.parseGotchas(file);
    return { raw, eol: raw && raw.includes("\r\n") ? "\r\n" : "\n", preamble: parsed.preamble, entries: parsed.entries };
  }
  function save(led) {
    const body =
      (led.preamble ? led.preamble + "\n\n" : led.entries.length ? "# Gotchas\n\n" : "") +
      led.entries.map((e) => e.text).join("\n\n") +
      "\n";
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, led.eol === "\r\n" ? body.replace(/\r?\n/g, "\r\n") : body);
    fs.renameSync(tmp, file);
  }
  // IDs are monotonic and NEVER reused — the archive counts too.
  function nextId(led) {
    const ids = led.entries.map((e) => e.id).concat(deps.parseGotchas(archive).entries.map((e) => e.id));
    const max = ids.reduce((m, id) => Math.max(m, Number(id.slice(2)) || 0), 0);
    if (max >= 999) return null;
    return "G-" + String(max + 1).padStart(3, "0");
  }
  function readObs() {
    if (!fs.existsSync(obsFile)) return [];
    const byId = new Map();
    for (const line of fs.readFileSync(obsFile, "utf8").replace(/\r\n/g, "\n").split("\n")) {
      if (!line.trim()) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch (_) {
        continue;
      }
      if (o && o.obs) {
        byId.delete(o.obs); // the LAST line per obs id wins, in file order
        byId.set(o.obs, o);
      }
    }
    return [...byId.values()];
  }
  function appendObs(o) {
    fs.mkdirSync(path.dirname(obsFile), { recursive: true });
    fs.appendFileSync(obsFile, JSON.stringify(o) + "\n");
  }
  return { file, archive, obsFile, load, save, nextId, readObs, appendObs };
}

// ── Linking an observation to an entry (the dedupe key) ─────────────────────
// Key = (rule or sig-signature, category, scope). A rule matches a rule; a
// sig matches the entry's symptom at 3-gram Jaccard ≥ JACCARD_MIN. The path
// must sit inside the entry's scope; a category must agree when both carry one.
function linksTo(o, v) {
  if (o.category && v.category && o.category !== v.category) return false;
  if (o.path && v.scope && !inScope(v.scope, o.path)) return false;
  if (o.rule || v.rule) return !!(o.rule && v.rule && o.rule === v.rule);
  return !!(o.sig && v.symptom && jaccard(o.sig, normalizeSig(v.symptom) || v.symptom) >= JACCARD_MIN);
}
function prOf(o) {
  if (o.pr !== undefined && o.pr !== null && o.pr !== "") return String(o.pr);
  const m = /\b(?:PR|MR)\s*#?\s*(\d+)/i.exec(o.ref || "");
  return m ? m[1] : null;
}
const isStrong = (o) =>
  o.outcome === "addressed" && ((o.source === "pr" && o.author === "human") || o.source === "sonar" || o.source === "defect");
// Human findings are MINED. Bot findings (a review bot, ORC's own reviewer)
// are MEASURED, not mined — except an in-lane red → green, which is a repair.
const isMined = (o) => o.author === "human" || ["sonar", "sarif", "ci", "defect"].includes(o.source) || (o.author === "orc" && o.reproduced === true);
const isLintRule = (r) => /^(eslint|ruff):/.test(r || "");

// ── Promotion (`05` §4), a PURE function of a candidate's cases ─────────────
// Returns { promote: bool, why, rule, needs }. Order: (a) in-lane, the miss,
// (c) security, (b) repetition. Every case counted is an `addressed` one.
function promotion(cases, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  const addressed = cases.filter((o) => o.outcome === "addressed");
  const inLane = addressed.find((o) => o.reproduced === true && IN_LANE_SOURCES.includes(o.source));
  if (inLane) return { promote: true, rule: "a", why: "in-lane red → green with a reproduction" };
  const miss = addressed.find((o) => o.miss === true);
  if (miss) return { promote: true, rule: "miss", why: "a miss: an ORC review read these lines and did not flag them" };
  const sec = addressed.find(
    (o) => o.category === "security" && (/^CWE-\d+$/.test(o.cwe || "") || ["HIGH", "BLOCKER"].includes(String(o.impact || "").toUpperCase()))
  );
  if (sec) return { promote: true, rule: "c", why: "security with a HIGH/BLOCKER impact or a CWE tag — at 1 case" };
  const recent = addressed.filter((o) => {
    const t = dateMs(o.at);
    return Number.isFinite(t) && now - t <= WINDOW_DAYS * DAY;
  });
  const distinct = new Set(recent.map((o) => o.obs)).size;
  const prs = new Set(recent.map(prOf).filter(Boolean)).size;
  if (distinct >= PROMOTE_CASES && prs >= PROMOTE_PRS)
    return { promote: true, rule: "b", why: `${distinct} addressed cases in ${prs} PRs within ${WINDOW_DAYS} days` };
  const need = [];
  if (distinct < PROMOTE_CASES) need.push(`${PROMOTE_CASES - distinct} more addressed case${PROMOTE_CASES - distinct === 1 ? "" : "s"} (${distinct} of ${PROMOTE_CASES})`);
  if (prs < PROMOTE_PRS) need.push(`${PROMOTE_PRS - prs} more PR${PROMOTE_PRS - prs === 1 ? "" : "s"} (${prs} of ${PROMOTE_PRS})`);
  return { promote: false, rule: null, why: null, needs: need.join(" in ") + ` within ${WINDOW_DAYS} days`, cases: distinct, prs };
}

// ── Candidates: the mined observations no entry has absorbed yet ────────────
function candidates(entries, obs, nowMs) {
  const views = entries.map(entryView);
  const groups = [];
  for (const o of obs) {
    if (!isMined(o)) continue;
    if (!["addressed", "disputed", "open", "wontfix"].includes(o.outcome)) continue;
    if (views.some((v) => linksTo(o, v))) continue;
    let g = groups.find((x) =>
      o.rule ? x.rule === o.rule && x.category === (o.category || null) : !x.rule && x.category === (o.category || null) && jaccard(o.sig, x.sig) >= JACCARD_MIN
    );
    if (!g) {
      g = { rule: o.rule || null, sig: o.sig || null, category: o.category || null, cases: [] };
      groups.push(g);
    }
    g.cases.push(o);
  }
  const out = [];
  for (const g of groups) {
    const addressed = g.cases.filter((o) => o.outcome === "addressed").length;
    const disputed = g.cases.filter((o) => o.outcome === "disputed").length;
    // One `addressed` or `disputed` outcome makes a candidate; an open case alone does not.
    if (!addressed && !disputed) continue;
    const { scope, refused } = deriveScope(g.cases.map((o) => o.path));
    const key = `${g.rule || "sig:" + g.sig}|${g.category || ""}|${scope || ""}`;
    const gating = ["P0", "P1"].some((s) => g.cases.some((o) => o.severity === s));
    const suppressible = !(g.category === "security" || ((g.category || "").startsWith("functional.") && gating));
    const isSuppression = disputed >= SUPPRESS_DISPUTES && disputed > addressed && suppressible;
    const kind = isSuppression ? "suppression" : isLintRule(g.rule) ? "project-action" : "candidate";
    const p = kind === "candidate" ? promotion(g.cases, nowMs) : { promote: false };
    const first = g.cases[0];
    const strong = g.cases.some(isStrong);
    out.push({
      id: "C-" + sha1((isSuppression ? "suppress|" : "") + key).slice(0, 6),
      kind,
      key,
      rule: g.rule,
      sig: g.sig,
      category: g.category,
      scope,
      scope_refused: refused,
      lang: first.lang || null,
      source: (g.cases.find(isStrong) || first).source,
      cases: g.cases.length,
      addressed,
      disputed,
      prs: new Set(g.cases.map(prOf).filter(Boolean)).size,
      strong,
      watch: kind === "candidate" && strong && !!scope,
      severity: g.cases.map((o) => o.severity).filter(Boolean).sort()[0] || null,
      cwe: (g.cases.find((o) => o.cwe) || {}).cwe || null,
      last_at: g.cases.map((o) => o.at).filter(Boolean).sort().pop() || null,
      promote: kind === "candidate" && !!scope && p.promote,
      promote_rule: p.rule || null,
      why: p.why || null,
      needs:
        kind === "project-action"
          ? `a lint rule — turn the linter rule on (${g.rule}); it is never a review item`
          : kind === "suppression"
            ? "a person accepts it: orc gotcha accept <id> (a suppression is never automatic)"
            : refused
              ? `no scope: ${refused}`
              : p.promote
                ? null
                : p.needs,
      obs: g.cases.map((o) => o.obs),
      _cases: g.cases,
    });
  }
  return out;
}
const publicCand = (c) => {
  const o = Object.assign({}, c);
  delete o._cases;
  return o;
};

// A candidate → an entry body. Structured fields only (§8): the rule, the
// category, the scope and the normalized `sig` — never a sentence from a
// comment body.
function entryFromCandidate(c, why, nowMs) {
  const now = new Date(nowMs === undefined ? Date.now() : nowMs);
  const src = c.kind === "suppression" ? "dismissal" : SOURCE_KIND[c.source] ? c.source : "review";
  const anchors = [];
  for (const o of c._cases) {
    if (!o.path) continue;
    const a = posix(o.path) + (Array.isArray(o.lines) && o.lines.length ? ":" + o.lines[0] : "");
    if (!anchors.includes(a)) anchors.push(a);
  }
  const what = c.rule ? `${c.rule}${c.sig ? " — " + c.sig : ""}` : c.sig || c.category || "a recurring finding";
  const seen = c._cases.map((o) => dateMs(o.at)).filter(Number.isFinite);
  return {
    area: oneLine(c.lang || (/\.([A-Za-z0-9]+)$/.exec(c.scope || "") || [])[1] || "any").replace(/·/g, "-") || "any",
    kind: SOURCE_KIND[src],
    fields: {
      trigger: `a change inside ${c.scope}${c.category ? " (" + c.category + ")" : ""}`,
      symptom: what,
      cause: c.kind === "suppression" ? "the team disputed this advice" : `${c.addressed} addressed case${c.addressed === 1 ? "" : "s"} recorded in observations.jsonl`,
      fix: c.kind === "suppression" ? "do not flag it here" : "(see `orc gotcha why`)",
      scope: c.scope,
      origin: `${why} · ${dmy(now)} · ${c.cases} case${c.cases === 1 ? "" : "s"} · ${c.prs} PR${c.prs === 1 ? "" : "s"}`,
      hits: String(c.kind === "suppression" ? c.disputed : c.addressed || 1),
      last_seen: seen.length ? dmyUtc(Math.max(...seen)) : dmy(now),
      source: src,
      rule: c.rule || undefined,
      category: c.category || undefined,
      cwe: c.cwe || undefined,
      severity: c.severity || undefined,
      polarity: c.kind === "suppression" ? "suppress" : "flag",
      evidence: anchors.slice(0, EVIDENCE_CAP).join(" · ") || undefined,
    },
  };
}

// ── Validating an `add` body. Returns { body } or { field, err } ────────────
function validateAdd(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { field: "body", err: "must be one JSON object" };
  const fields = b.fields && typeof b.fields === "object" ? Object.assign({}, b.fields) : {};
  for (const k of REQUIRED.concat(OPTIONAL)) if (b[k] !== undefined && fields[k] === undefined) fields[k] = b[k];
  const source = fields.source ? String(fields.source) : null;
  if (source && !SOURCE_KIND[source]) return { field: "source", err: `must be one of: ${Object.keys(SOURCE_KIND).join(", ")}` };
  const kind = b.kind ? String(b.kind) : source ? SOURCE_KIND[source] : null;
  if (!KINDS.includes(kind)) return { field: "kind", err: `must be one of: ${KINDS.join(", ")}` };
  if (source && SOURCE_KIND[source] !== kind) return { field: "kind", err: `source ${source} is filed under kind ${SOURCE_KIND[source]}` };
  const area = oneLine(b.area || b.lang || "");
  if (!area || area.includes("·")) return { field: "area", err: "must be a non-empty word with no `·`" };
  const today = dmy(new Date());
  if (fields.hits === undefined) fields.hits = 1;
  if (fields.last_seen === undefined) fields.last_seen = today;
  for (const k of REQUIRED) {
    const v = fields[k];
    if (v === undefined || v === null || !oneLine(v)) return { field: k, err: "is required" };
    if (/[\r\n]/.test(String(v))) return { field: k, err: "must be one line" };
  }
  if (!/^\d+$/.test(String(fields.hits))) return { field: "hits", err: "must be a whole number" };
  if (!/^\d{2}-\d{2}-\d{4}$/.test(String(fields.last_seen))) return { field: "last_seen", err: "must be DD-MM-YYYY" };
  if (wholeRepo(fields.scope)) return { field: "scope", err: "covers the whole repo — a gotcha is never injected unfiltered" };
  if (fields.category && !CATEGORIES.includes(fields.category)) return { field: "category", err: `must be one of: ${CATEGORIES.join(", ")}` };
  if (fields.cwe && !/^CWE-\d+$/.test(fields.cwe)) return { field: "cwe", err: "must be CWE-<number>" };
  if (fields.severity && !SEVERITIES.includes(fields.severity)) return { field: "severity", err: "must be P0, P1, P2 or P3" };
  if (fields.polarity && !POLARITIES.includes(fields.polarity)) return { field: "polarity", err: "must be flag or suppress" };
  for (const k of ["helpful", "harmful"]) if (fields[k] !== undefined && !/^\d+$/.test(String(fields[k]))) return { field: k, err: "must be a whole number" };
  for (const k of OPTIONAL) if (fields[k] !== undefined && /[\r\n]/.test(String(fields[k]))) return { field: k, err: "must be one line" };
  return { body: { area, kind, fields } };
}

// Dedupe on the key: same rule (or symptom at Jaccard ≥ 0.6 on the normalized
// text), same category when both carry one, same scope.
function findDuplicate(entries, body) {
  const f = body.fields;
  return entries.find((e) => {
    const v = entryView(e);
    if (posix(v.scope) !== posix(f.scope)) return false;
    if (f.category && v.category && f.category !== v.category) return false;
    if (f.rule || v.rule) return f.rule === v.rule;
    const a = normalizeSig(f.symptom) || String(f.symptom).toLowerCase();
    const b = normalizeSig(v.symptom) || String(v.symptom || "").toLowerCase();
    return a === b || jaccard(a, b) >= JACCARD_MIN;
  });
}

// A match bumps `hits`/`last_seen` and adds the evidence line — never a second entry.
function bumpEntry(e, { by = 1, seen, evidence, helpful = 0, harmful = 0 } = {}) {
  const v = entryView(e);
  const f = Object.assign({}, e.fields);
  f.hits = String(e.hits + by);
  const cur = dateMs(f.last_seen);
  const nxt = dateMs(seen);
  if (seen && (!Number.isFinite(cur) || nxt > cur)) f.last_seen = seen;
  if (evidence && evidence.length) {
    const list = v.evidence.slice();
    for (const a of evidence) if (a && !list.includes(a)) list.push(a);
    f.evidence = list.slice(-EVIDENCE_CAP).join(" · ");
  }
  if (helpful) f.helpful = String(v.helpful + helpful);
  if (harmful) f.harmful = String(v.harmful + harmful);
  e.fields = f;
  e.hits = Number(f.hits);
  e.text = renderEntry(e.id, e.area, e.kind, f, extraLines(e));
  e.lines = e.text.split("\n");
  return e;
}
function appendEntry(store, led, body) {
  const id = store.nextId(led);
  if (!id) return null;
  const text = renderEntry(id, body.area, body.kind, body.fields, []);
  const e = { id, area: body.area, kind: body.kind, lines: text.split("\n"), fields: {}, text };
  for (const k of REQUIRED.concat(OPTIONAL)) if (body.fields[k] !== undefined && body.fields[k] !== null && String(body.fields[k]) !== "") e.fields[k] = oneLine(body.fields[k]);
  e.hits = Number(e.fields.hits) || 0;
  led.entries.push(e);
  return e;
}

// ── Derived states: orphaned, quiet, "do" line ──────────────────────────────
function trackedFiles(repoRoot) {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
    return out.split("\0").filter(Boolean);
  } catch (_) {
    return null; // not a git repo: the orphan check cannot run, so it marks nothing
  }
}
function orphanReason(v, tracked, repoRoot) {
  if (!tracked) return null;
  if (v.scope && !tracked.some((f) => inScope(v.scope, f))) return "its scope matches no tracked file";
  if (v.evidence.length) {
    const alive = v.evidence.some((a) => fs.existsSync(path.join(repoRoot, a.replace(/:\d+(?:-\d+)?$/, ""))));
    if (!alive) return "every evidence anchor points at a file that no longer exists";
  }
  return null;
}
function isQuiet(v, nowMs) {
  const t = dateMs(v.last_seen);
  return Number.isFinite(t) && nowMs - t > WINDOW_DAYS * DAY;
}
// Activation date = the first DD-MM-YYYY in `origin`.
function activation(v) {
  const m = /(\d{2}-\d{2}-\d{4})/.exec(v.origin || "");
  return m ? dateMs(m[1]) : NaN;
}
// Executor eligibility (`05` §5.1): a v1 source, OR the "do" line — fired
// again after activation AND 5+ total cases.
function doLine(v, obs) {
  if (V1_SOURCES.includes(v.source)) return true;
  if (v.hits < DO_LINE_CASES) return false;
  const act = activation(v);
  if (!Number.isFinite(act)) return false;
  return obs.some((o) => o.outcome === "addressed" && linksTo(o, v) && dateMs(o.at) > act);
}

// ── Card lines ──────────────────────────────────────────────────────────────
const SEV_W = { P0: 4, P1: 3, P2: 2, P3: 1 };
function rankOf(v, nowMs) {
  const t = dateMs(v.last_seen);
  const days = Number.isFinite(t) ? Math.max(0, (nowMs - t) / DAY) : WINDOW_DAYS * 2;
  return (SEV_W[v.severity] || 2) * Math.log(1 + Math.max(1, v.hits)) * (1 / (1 + days / WINDOW_DAYS)) * specificity(v.scope || "");
}
function lineFor(v) {
  const label = v.rule || v.source;
  const fix = v.fix && !v.fix.startsWith("(") ? ` → ${v.fix}` : "";
  const count = v.hits > 1 ? `(${v.hits}×)` : IN_LANE_SOURCES.includes(v.source) ? "(reproduced)" : `(${v.hits}×)`;
  return `${v.id} ${label} · ${v.scope} · ${v.symptom}${fix} ${count}`;
}
function watchLine(c) {
  return `watch: ${c.id} ${c.rule || c.source} · ${c.scope} · ${c.sig || c.category || "a finding"} (seen ${c.addressed}×)`;
}
function suppressLine(v) {
  return `do not flag: ${v.id} · ${v.scope} · ${v.symptom} (the team disputed this ${v.hits}×)`;
}

// ── Quality (acceptance of ORC's own findings) ──────────────────────────────
// v2.1.0 — A REVIEW IS ALSO READ FROM THE TRACES. Until 2.1.0 a review counted
// only when a lane piped an observation with `run`, and no lane did so in
// practice: the panel said "5 reviews needed — 0 so far" over 23 reviewer
// returns. A trace run in the window that has a `FINDING-OUTCOME` line OR a
// hook `RETURN orc-reviewer-*` line (a reviewer the user spawned directly gets a
// bootstrap trace with that pair) is a review. A clean review (zero findings)
// counts as a review and adds to nothing else (DE-11). Acceptance and the
// categories still come from the observations only.
const TRACE_REVIEW = /^\[[^\]]*\]\s+(?:\S+\s+FINDING-OUTCOME\b|hook\s+RETURN\s+orc-reviewer-)/m;
function tracedReviewRuns(claudeDir, deps, windowDays, nowMs) {
  if (!deps || typeof deps.listTraces !== "function") return [];
  let runs = [];
  try {
    runs = deps.listTraces(claudeDir).runs;
  } catch (_) {
    return [];
  }
  const out = [];
  for (const r of runs) {
    const t = r.date ? Date.parse(r.date + "T00:00:00Z") : r.mtime;
    if (Number.isFinite(t) && nowMs - t > windowDays * DAY) continue;
    let text = "";
    try {
      text = fs.readFileSync(r.path, "utf8");
    } catch (_) {
      continue;
    }
    if (TRACE_REVIEW.test(text)) out.push(r.name.replace(/\.txt$/, ""));
  }
  return out;
}
function fixSummary(fixes) {
  const by = (key, vocab) => {
    const out = {};
    for (const v of vocab) out[v] = 0;
    for (const o of fixes) {
      const k = o[key] || "unknown";
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  };
  // `share` is the bar width, so the panel computes no number itself.
  const causes = FIX_CAUSES.map((id) => {
    const n = fixes.filter((o) => fixCause(o) === id).length;
    return { id, n, share: fixes.length ? Math.round((n / fixes.length) * 1000) / 1000 : 0 };
  });
  return { total: fixes.length, by_introduced_by: by("introduced_by", INTRODUCED_BY), by_source: by("source", []), causes };
}
function missSummary(fixes) {
  const miss = fixes.filter((o) => o.miss === true);
  const cats = {};
  for (const o of miss) {
    const c = o.category || "uncategorized";
    cats[c] = (cats[c] || 0) + 1;
  }
  return {
    total: miss.length,
    by_category: Object.entries(cats)
      .map(([category, n]) => ({ category, n }))
      .sort((a, b) => b.n - a.n || a.category.localeCompare(b.category)),
    list: miss
      .slice()
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 10)
      .map((o) => ({ obs: o.obs.slice(0, 8), at: o.at, path: o.path, lines: o.lines, source: o.source, rule: o.rule, category: o.category, introduced_by: o.introduced_by || null, missed_by: o.missed_by || null, fix_run: o.fix_run || null })),
  };
}
function quality(obs, entries, windowDays, nowMs, traced) {
  const fixes = fixesIn(obs, windowDays, nowMs);
  const orc = obs.filter((o) => o.author === "orc" && (() => {
    const t = dateMs(o.at);
    return !Number.isFinite(t) || nowMs - t <= windowDays * DAY;
  })());
  // v2.1.0 §3.4 — the headline counts ORC reviews. A review the project asked for
  // (`reviewer: "<name>"`) is counted in its own line, `by_reviewer`.
  const external = orc.filter((o) => o.reviewer);
  const own = orc.filter((o) => !o.reviewer);
  const observedRuns = [...new Set(own.map((o) => o.run).filter(Boolean))];
  const tracedRuns = [...new Set(traced || [])];
  const runs = [...new Set(observedRuns.concat(tracedRuns))];
  const byReviewer = { orc: runs.length };
  for (const o of external) {
    const k = o.reviewer;
    byReviewer[k] = byReviewer[k] || new Set();
    byReviewer[k].add(o.run || o.ref);
  }
  for (const k of Object.keys(byReviewer)) if (byReviewer[k] instanceof Set) byReviewer[k] = byReviewer[k].size;
  const cats = {};
  for (const o of orc) {
    const c = o.category || "uncategorized";
    const r = (cats[c] = cats[c] || { category: c, findings: 0, addressed: 0, disputed: 0, wontfix: 0, open: 0 });
    r.findings++;
    if (r[o.outcome] !== undefined) r[o.outcome]++;
  }
  const categories = Object.values(cats)
    .map((r) => {
      const decided = r.addressed + r.disputed + r.wontfix;
      const acceptance = decided ? Math.round((r.addressed / decided) * 1000) / 1000 : null;
      return Object.assign(r, { acceptance, noisy: r.findings >= NOISE_MIN_FINDINGS && acceptance !== null && acceptance < NOISE_ACCEPTANCE });
    })
    .sort((a, b) => b.findings - a.findings || a.category.localeCompare(b.category));
  const p3 = orc.filter((o) => o.severity === "P3").length;
  const sorted = orc.filter((o) => Number.isFinite(dateMs(o.at))).sort((a, b) => dateMs(a.at) - dateMs(b.at));
  const half = Math.floor(sorted.length / 2);
  const acc = (xs) => {
    const d = xs.filter((o) => ["addressed", "disputed", "wontfix"].includes(o.outcome));
    return d.length ? Math.round((d.filter((o) => o.outcome === "addressed").length / d.length) * 1000) / 1000 : null;
  };
  const first = acc(sorted.slice(0, half));
  const second = acc(sorted.slice(half));
  const gotchas = entries.map(entryView).map((v) => ({
    id: v.id,
    helpful: v.helpful,
    harmful: v.harmful,
    retire: v.harmful >= 3 && v.harmful >= v.helpful,
  }));
  return {
    window_days: windowDays,
    reviews: runs.length,
    reviews_traced: tracedRuns.length,
    reviews_observed: observedRuns.length,
    by_reviewer: byReviewer,
    project_reviews: Object.entries(byReviewer).filter(([k]) => k !== "orc").reduce((n, [, v]) => n + v, 0),
    // v2.1.0 §4.2 — the fixes made after a review (`orc fix record`). A fix's
    // author is the finder, so none of these is ever counted as a review above.
    fixes: fixSummary(fixes),
    misses: missSummary(fixes),
    floor: QUALITY_FLOOR,
    below_floor: runs.length < QUALITY_FLOOR,
    findings: orc.length,
    categories,
    gotchas,
    p3_per_review: runs.length ? Math.round((p3 / runs.length) * 100) / 100 : null,
    trend: { first_half: first, second_half: second, direction: first === null || second === null ? null : second > first ? "up" : second < first ? "down" : "flat" },
    // v2.0.0 W7 — the Behaviour panel's review-quality tab. The target, the
    // bands and the floor sentence are the CLI's, so the panel computes none.
    target: QUALITY_TARGET,
    bands: { ok: QUALITY_TARGET, warn: NOISE_ACCEPTANCE },
    series: reviewSeries(orc),
    floor_line: runs.length < QUALITY_FLOOR ? `${QUALITY_FLOOR} reviews needed — ${runs.length} so far.` : null,
  };
}
// One point per review (run), oldest first, the last 12: its acceptance
// (null when nothing in it was decided) and its advice-only (P3) count.
function reviewSeries(orc) {
  const by = new Map();
  for (const o of orc) {
    if (!o.run) continue;
    const t = dateMs(o.at);
    const r = by.get(o.run) || { run: o.run, at: Number.isFinite(t) ? t : 0, list: [] };
    if (Number.isFinite(t) && t > r.at) r.at = t;
    r.list.push(o);
    by.set(o.run, r);
  }
  return [...by.values()]
    .sort((a, b) => a.at - b.at || a.run.localeCompare(b.run))
    .slice(-QUALITY_SERIES)
    .map((r) => {
      const d = r.list.filter((o) => ["addressed", "disputed", "wontfix"].includes(o.outcome));
      return {
        run: r.run,
        at: r.at ? new Date(r.at).toISOString() : null,
        findings: r.list.length,
        acceptance: d.length ? Math.round((d.filter((o) => o.outcome === "addressed").length / d.length) * 1000) / 1000 : null,
        p3: r.list.filter((o) => o.severity === "P3").length,
      };
    });
}

// ── The panel view of the ledger (v2.0.0 W7) ────────────────────────────────
// `orc gotcha list --json` carries this beside the v1 rows: each entry's source,
// its computed status and a 7-week hits line, plus the sync state as it was
// last written. It READS the sync file; it never runs a sync.
const STATUSES = ["active", "candidate", "quiet", "orphaned"];
function panelView(claudeDir, deps, entries) {
  const repoRoot = deps.repoRootOf(claudeDir);
  const store = makeStore(claudeDir, deps);
  const obs = store.readObs();
  const now = Date.now();
  const tracked = trackedFiles(repoRoot);
  const rows = entries.map((e) => {
    const v = entryView(e);
    const why = orphanReason(v, tracked, repoRoot);
    const status = why ? "orphaned" : isQuiet(v, now) ? "quiet" : "active";
    const weeks = Array(7).fill(0);
    for (const o of obs) {
      if (!linksTo(o, v) && o.gotcha !== v.id) continue;
      const t = dateMs(o.at);
      if (!Number.isFinite(t)) continue;
      const w = Math.floor((now - t) / (7 * DAY));
      if (w >= 0 && w < 7) weeks[6 - w]++;
    }
    return { id: v.id, source: v.source, status, status_reason: why, rule: v.rule, scope: v.scope, fix: v.fix, symptom: v.symptom, polarity: v.polarity, origin: v.origin, weeks };
  });
  let cands = [];
  try {
    cands = candidates(entries, obs, now);
  } catch (_) {}
  let sync = null;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(claudeDir, "orc", "gotchas-sync.json"), "utf8"));
    sync = {
      last_sync: s.last_sync || null,
      sources: Object.entries(s.sources || {}).map(([name, c]) => ({
        name,
        state: c && c.last_error ? (/timed out/.test(c.last_error) ? "timed out" : "failed") : c && c.last_ok ? "ok" : "not configured",
        last_ok: (c && c.last_ok) || null,
        last_error: (c && c.last_error) || null,
      })),
    };
  } catch (_) {}
  const bySource = {};
  for (const r of rows) bySource[r.source] = (bySource[r.source] || 0) + 1;
  const status_counts = Object.fromEntries(STATUSES.map((s) => [s, s === "candidate" ? cands.filter((c) => c.kind === "candidate").length : rows.filter((r) => r.status === s).length]));
  return {
    sources: Object.keys(SOURCE_KIND),
    statuses: STATUSES,
    by_source: Object.keys(SOURCE_KIND).filter((s) => bySource[s]).map((s) => ({ source: s, n: bySource[s] })),
    status_counts,
    rows,
    sync,
  };
}

// ── Observations: validate one body, record a batch (W6a) ────────────────────
// `observe -` and every importer (`bin/gotcha-import.js`) go through these two,
// so there is ONE writer of observations.jsonl and ONE promotion pass.
// A body → { o } or { field, err }. Pure: no file is read or written.
function normalizeObservation(b, now) {
  const bad = (field, err) => ({ field, err });
  if (!b || typeof b !== "object" || Array.isArray(b)) return bad("body", "must be one JSON object");
  if (!SOURCE_KIND[b.source]) return bad("source", `must be one of: ${Object.keys(SOURCE_KIND).join(", ")}`);
  if (!b.ref || typeof b.ref !== "string") return bad("ref", "is required (e.g. \"PR 142 · thread 3\")");
  if (!OUTCOMES.includes(b.outcome)) return bad("outcome", `must be one of: ${OUTCOMES.join(", ")}`);
  if (!AUTHORS.includes(b.author)) return bad("author", `must be one of: ${AUTHORS.join(", ")}`);
  // v2.1.0 — an ORC finding without its run counted as a finding and never as a
  // review. A `ref` that starts with the run id fills `run`; otherwise refuse.
  if (b.author === "orc" && !b.run) {
    const m = typeof b.ref === "string" && /^(run-[a-z0-9][a-z0-9-]*-\d{6}-\d{6})\b/.exec(b.ref);
    if (m) b = Object.assign({}, b, { run: m[1] });
    else return bad("run", "is required when author is orc (the trace name, e.g. run-orc-add-billing-050826-141233)");
  }
  if (b.category !== undefined && b.category !== null && !CATEGORIES.includes(b.category)) return bad("category", `must be one of: ${CATEGORIES.join(", ")}`);
  if (b.severity !== undefined && b.severity !== null && !SEVERITIES.includes(b.severity)) return bad("severity", "must be P0, P1, P2 or P3");
  if (b.cwe !== undefined && b.cwe !== null && !/^CWE-\d+$/.test(b.cwe)) return bad("cwe", "must be CWE-<number>");
  if (b.gotcha !== undefined && b.gotcha !== null && !/^G-\d{3}$/.test(b.gotcha)) return bad("gotcha", "must be a G-### id");
  const sig = b.sig || b.text ? normalizeSig(b.sig || b.text) : null;
  if (!b.rule && !sig) return bad("rule", "or `sig` is required (a stable rule id, or the finding text)");
  const at = b.at && Number.isFinite(dateMs(b.at)) ? String(b.at).slice(0, 10) : isoDay(new Date(now));
  const o = {
    obs: sha1(`${b.source}|${b.ref}`),
    source: b.source,
    // No names (§8): the ref is kept only as the caller's structured locator.
    ref: oneLine(b.ref).slice(0, 120),
    commit: b.commit ? oneLine(b.commit).slice(0, 40) : null,
    at,
    rule: b.rule ? oneLine(b.rule) : null,
    sig: b.rule ? sig || null : sig,
    category: b.category || null,
    severity: b.severity || null,
    path: b.path ? posix(b.path) : null,
    lines: Array.isArray(b.lines) ? b.lines.filter((n) => Number.isInteger(n)).slice(0, 2) : null,
    lang: b.lang ? oneLine(b.lang) : null,
    outcome: b.outcome,
    author: b.author,
    run: b.run ? oneLine(b.run) : null,
  };
  if (b.pr !== undefined && b.pr !== null) o.pr = String(b.pr);
  if (b.cwe) o.cwe = b.cwe;
  if (b.impact) o.impact = String(b.impact).toUpperCase();
  if (b.reproduced === true) o.reproduced = true;
  if (b.miss === true) o.miss = true;
  if (b.gotcha) o.gotcha = b.gotcha;
  // v2.1.0 — a review the PROJECT asked for (review-slice.md §0 option 2). An
  // OPTIONAL field after the nine, so a 1.9.2 / 2.0.x reader still reads the row.
  if (b.reviewer && typeof b.reviewer === "string" && b.reviewer !== "orc") o.reviewer = oneLine(b.reviewer).slice(0, 60);
  // v2.1.0 §4.2 — a FIX record. OPTIONAL fields after the existing ones. The
  // author is the FINDER (bot or human), never orc: an orc author would make
  // Review Quality count the fix as an ORC review.
  if (b.introduced_by !== undefined && b.introduced_by !== null) {
    if (!INTRODUCED_BY.includes(b.introduced_by)) return bad("introduced_by", `must be one of: ${INTRODUCED_BY.join(", ")}`);
    o.introduced_by = b.introduced_by;
  }
  if (b.via !== undefined && b.via !== null) {
    if (!FIX_VIA.includes(b.via)) return bad("via", `must be one of: ${FIX_VIA.join(", ")}`);
    o.via = b.via;
  }
  if (b.fix_run) o.fix_run = oneLine(b.fix_run).slice(0, 120);
  if (b.missed_by) o.missed_by = oneLine(b.missed_by).slice(0, 120);
  if (b.class_by === "user" || b.class_by === "evidence") o.class_by = b.class_by;
  if ((o.introduced_by || o.via || o.fix_run) && o.author === "orc")
    return bad("author", "of a fix is the FINDER (bot or human) — never orc, or Review Quality counts the fix as an ORC review");
  return { o };
}
const isFixRecord = (o) => !!(o && (o.via || o.introduced_by));

// ── The reviewed ranges (DE-13) ─────────────────────────────────────────────
// `.claude/orc/review-scope.jsonl`: one line per review close,
// `{run, commit, at, files: {path: [[start,end],…]}}`. Class b user data: never
// pruned by age, never in the install manifest. The last SCOPE_CAP reviews are
// kept; what is dropped is COUNTED in the first line (`{"meta": …, "dropped": n}`).
function scopeFile(claudeDir) {
  return path.join(claudeDir, "orc", "review-scope.jsonl");
}
function readScopes(claudeDir) {
  const f = scopeFile(claudeDir);
  const out = { rows: [], dropped: 0 };
  if (!fs.existsSync(f)) return out;
  for (const line of fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch (_) {
      continue;
    }
    if (r && r.meta === "review-scope") out.dropped = Number(r.dropped) || 0;
    else if (r && r.run && r.files) out.rows.push(r);
  }
  return out;
}
// A body → { row } or { field, err }. Pure.
function normalizeScope(b, now) {
  const bad = (field, err) => ({ field, err });
  if (!b.run || typeof b.run !== "string") return bad("run", "is required (the trace name of the review's run)");
  if (!b.files || typeof b.files !== "object" || Array.isArray(b.files)) return bad("files", "must be {path: [[start,end], …]}");
  const files = {};
  for (const [p, ranges] of Object.entries(b.files)) {
    if (!Array.isArray(ranges)) return bad("files", `${p}: must be a list of [start,end] pairs`);
    const list = [];
    for (const r of ranges) {
      const pair = Array.isArray(r) ? r : [r, r];
      const s = pair[0];
      const e = pair.length > 1 ? pair[1] : pair[0];
      if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e < s) return bad("files", `${p}: ${JSON.stringify(r)} is not a [start,end] line pair`);
      list.push([s, e]);
    }
    if (list.length) files[posix(p)] = list;
  }
  if (!Object.keys(files).length) return bad("files", "names no reviewed range");
  return { row: { run: oneLine(b.run).slice(0, 120), commit: b.commit ? oneLine(b.commit).slice(0, 40) : null, at: new Date(now).toISOString(), files } };
}
function recordScope(claudeDir, row) {
  const f = scopeFile(claudeDir);
  const cur = readScopes(claudeDir);
  const rows = cur.rows.concat(row);
  const over = Math.max(0, rows.length - SCOPE_CAP);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (!over) {
    fs.appendFileSync(f, JSON.stringify(row) + "\n");
    return { kept: rows.length, dropped: cur.dropped, dropped_now: 0 };
  }
  const dropped = cur.dropped + over;
  const body = [JSON.stringify({ meta: "review-scope", dropped })].concat(rows.slice(over).map((r) => JSON.stringify(r))).join("\n") + "\n";
  const tmp = f + ".tmp";
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, f);
  return { kept: rows.length - over, dropped, dropped_now: over };
}
// The latest stored review of an EARLIER run whose ranges overlap the fix's
// lines → that scope row, or null. A review older than the commit that wrote
// the bad lines could not have seen them, so it is never a miss.
function findMiss(scopes, o, introducedMs) {
  if (!o || !o.path || !Array.isArray(o.lines) || !o.lines.length) return null;
  const s = o.lines[0];
  const e = o.lines.length > 1 ? o.lines[1] : o.lines[0];
  let best = null;
  for (const r of scopes) {
    if (!r.run || (o.fix_run && r.run === o.fix_run)) continue;
    const ranges = r.files && r.files[o.path];
    if (!Array.isArray(ranges) || !ranges.some((x) => x[0] <= e && s <= x[1])) continue;
    const at = Date.parse(r.at);
    if (Number.isFinite(introducedMs) && Number.isFinite(at) && at < introducedMs) continue;
    if (!best || at > Date.parse(best.at)) best = r;
  }
  return best;
}

// The CLI computes `miss` for a fix record (§4.2 item 4) from the stored scopes.
function applyMiss(claudeDir, o, introducedMs) {
  const hit = findMiss(readScopes(claudeDir).rows, o, introducedMs);
  return hit ? Object.assign({}, o, { miss: true, missed_by: hit.run }) : o;
}

// ── The fix records in a window: the card line and the quality block ────────
function fixesIn(obs, windowDays, nowMs) {
  return obs.filter((o) => {
    if (!isFixRecord(o)) return false;
    const t = dateMs(o.at);
    return !Number.isFinite(t) || nowMs - t <= windowDays * DAY;
  });
}
const FIX_LABEL = { sonar: "Sonar", ci: "CI", defect: "defect", pr: "PR review", review: "review", sarif: "SARIF" };
function fixLine(o, n) {
  const what = o.rule ? o.rule.replace(/^sonar:/, "") : o.sig ? o.sig.slice(0, 60) : "a fix";
  const after =
    o.introduced_by === "orc" ? ` after ORC run ${o.run || "(run unknown)"}` : o.introduced_by === "ai" ? " after AI-written code" : "";
  return `fix: ${o.path} — ${FIX_LABEL[o.source] || o.source} ${what}${o.category ? ` (${o.category})` : ""}${after}${o.miss ? " · missed by review" : ""}${n > 1 ? ` (+${n - 1} more)` : ""}`;
}
// The cause buckets the panel draws, in its order. Computed HERE, so the panel
// computes no number the CLI could give.
const FIX_CAUSES = ["sonar", "orc", "ai", "other"];
function fixCause(o) {
  if (o.source === "sonar") return "sonar";
  if (o.introduced_by === "orc") return "orc";
  if (o.introduced_by === "ai") return "ai";
  return "other";
}

// Append each normalized observation, bump what an active entry already covers,
// then run promotion ONCE. `skipUnchanged`: an importer re-reading the same
// source never appends a line whose outcome did not move (the file stays small).
function recordObservations(store, led, list, now, opts) {
  const skipUnchanged = !!(opts && opts.skipUnchanged);
  const known = new Map(store.readObs().map((x) => [x.obs, x]));
  const changes = { bumped: [], promoted: [], helpful: [], harmful: [] };
  const recorded = [];
  let unchanged = 0;
  for (let o of list) {
    const prev = known.get(o.obs) || null;
    // v2.1.0 §4.2 — an import that upserts a FIX record's row (the same id,
    // `sha1("sonar|sonar <key>")`) adds its outcome and keeps the fix fields.
    if (prev && isFixRecord(prev)) {
      const keep = {};
      for (const k of FIX_FIELDS) if (prev[k] !== undefined && prev[k] !== null && (o[k] === undefined || o[k] === null)) keep[k] = prev[k];
      if (Object.keys(keep).length) o = Object.assign({}, o, keep);
    }
    if (skipUnchanged && prev && prev.outcome === o.outcome) {
      unchanged++;
      continue;
    }
    store.appendObs(o);
    known.set(o.obs, o);
    recorded.push({ o, prev });
    const firstAddressed = o.outcome === "addressed" && !(prev && prev.outcome === "addressed");
    // A citation of a gotcha by ORC's reviewer: the ACE / ExpeL counters.
    if (o.gotcha && (!prev || prev.outcome !== o.outcome)) {
      const e = led.entries.find((x) => x.id === o.gotcha);
      if (e && o.outcome === "addressed") {
        bumpEntry(e, { by: 0, helpful: 1 });
        changes.helpful.push(e.id);
      } else if (e && o.outcome === "disputed") {
        bumpEntry(e, { by: 0, harmful: 1 });
        changes.harmful.push(e.id);
      }
    }
    // A mined case an ACTIVE entry already covers: bump it, never a second entry.
    const linked = isMined(o) ? led.entries.find((e) => entryView(e).polarity === "flag" && linksTo(o, entryView(e))) : null;
    if (linked && firstAddressed) {
      bumpEntry(linked, { seen: dmyUtc(dateMs(o.at)), evidence: o.path ? [o.path + (o.lines && o.lines.length ? ":" + o.lines[0] : "")] : [] });
      changes.bumped.push(linked.id);
    }
  }
  // Promotion — computed, and it names why in `origin`.
  const all = store.readObs();
  if (recorded.length) {
    for (const c of candidates(led.entries, all, now).filter((x) => x.promote)) {
      const body = entryFromCandidate(c, `promoted (${c.why})`, now);
      const e = appendEntry(store, led, body);
      if (e) changes.promoted.push({ candidate: c.id, id: e.id, rule: c.promote_rule, why: c.why });
    }
  }
  if (changes.bumped.length || changes.promoted.length || changes.helpful.length || changes.harmful.length) store.save(led);
  return { recorded, unchanged, changes, all };
}

// ── The CLI ─────────────────────────────────────────────────────────────────
const USAGE =
  "Usage: orc gotcha add <file|->                 add one entry (dedupes; exit 0 added · 3 bumped · 2 malformed)\n" +
  "       orc gotcha match --files <csv>           the executor block (exit 0 · 1 no match · 4 off)\n" +
  "       orc gotcha card --files <csv> [--lane <l>] [--full]   the reviewer card (exit 0 · 1 no match)\n" +
  "       orc gotcha filter --findings <file|->    drop suppressed / folded / noisy advice; never a P0 or P1\n" +
  "       orc gotcha observe <file|->              append one observation, then run promotion (exit 0 · 2 malformed);\n" +
  "                                                a {kind: \"review-scope\"} body stores the ranges a review read\n" +
  "       orc gotcha list --candidates             computed candidates and proposed suppressions (exit 0 · 1 none)\n" +
  "       orc gotcha accept <C-id>                 a person promotes a candidate (exit 0 · 2 unknown)\n" +
  "       orc gotcha quality [--window <days>]     acceptance per category (exit 0 · 1 below the 5-review floor)\n" +
  "       orc gotcha why <G-id|C-id>               every observation behind it (exit 0 · 2 unknown)\n" +
  "       orc gotcha export --review-md            the active entries as a REVIEW.md (exit 0 · 1 none)\n" +
  "       orc gotcha import sarif <file>           SARIF 2.1.0 → observations (exit 0 · 2 not SARIF)\n" +
  "       orc gotcha import sonar [--url U --project K] [--pr N|--branch B] [--org O] [--file <saved answer>]\n" +
  "                                                Sonar issues → observations; token from SONAR_TOKEN only (exit 0 · 2 · 5 auth · 6 network)\n" +
  "       orc gotcha import pr <n>                 PR review threads (humans only) → observations (exit 0 · 5 gh missing/not authed)\n" +
  "       orc gotcha import issues [--label bug]   closed defects with a closing PR → observations (exit 0 · 5)\n" +
  "       orc gotcha sync [--force]                every available source, incremental, time-boxed (exit 0 synced · 1 nothing new · 6 a source failed)";

function gotchaCmd(deps, sub) {
  const { emitJson, wantsJson, args } = deps;
  const asJson = wantsJson();
  const claudeDir = deps.resolveClaudeDir();
  const repoRoot = deps.repoRootOf(claudeDir);
  const store = makeStore(claudeDir, deps);
  const now = Date.now();
  const valueOf = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const v = args[i + 1];
    return v !== undefined && (v === "-" || !v.startsWith("--")) ? v : "";
  };
  const pos = deps.positionals();
  const out = (obj, code, human) => {
    if (asJson) emitJson(obj, code);
    if (human) human();
    process.exit(code);
  };
  const fail = (code, reason, message, extra) =>
    out(Object.assign({ ok: false, reason }, extra || {}, { message }), code, () => console.error(message));
  const readInput = (src) => {
    if (src === undefined || src === "" || src === true) return { err: "names no input — pass a file path or - for stdin" };
    try {
      const text = src === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(String(src)), "utf8");
      return { value: JSON.parse(text.replace(/^﻿/, "")) };
    } catch (e) {
      return { err: `is not valid JSON (${e.message.split("\n")[0]})` };
    }
  };
  const cfg = () => deps.readOverride(claudeDir).map;
  const filesArg = () =>
    String(valueOf("--files") || "")
      .split(",")
      .map((f) => posix(f.trim()))
      .filter(Boolean);

  // ── add ──
  if (sub === "add") {
    const inp = readInput(pos[2] || (args.includes("-") ? "-" : undefined));
    if (inp.err) return fail(2, "malformed", `gotcha add: the input ${inp.err}`, { field: "body" });
    const v = validateAdd(inp.value);
    if (v.err) return fail(2, "malformed", `gotcha add: field \`${v.field}\` ${v.err}`, { field: v.field });
    const led = store.load();
    const dup = findDuplicate(led.entries, v.body);
    if (dup) {
      const ev = v.body.fields.evidence ? String(v.body.fields.evidence).split(/\s+·\s+/) : [];
      bumpEntry(dup, { by: Number(v.body.fields.hits) || 1, seen: v.body.fields.last_seen, evidence: ev });
      store.save(led);
      return out({ ok: true, action: "bumped", id: dup.id, hits: dup.hits, last_seen: dup.fields.last_seen, file: store.file, text: dup.text }, 3, () =>
        console.log(`✓ ${dup.id} already covers this — hits ${dup.hits}, last seen ${dup.fields.last_seen}. Nothing new was added.`)
      );
    }
    const e = appendEntry(store, led, v.body);
    if (!e) return fail(2, "ids-exhausted", "gotcha add: G-999 is the last id the heading allows — archive with `orc gotcha prune`.", { field: "id" });
    store.save(led);
    return out({ ok: true, action: "added", id: e.id, hits: e.hits, last_seen: e.fields.last_seen, file: store.file, text: e.text }, 0, () =>
      console.log(`✓ added ${e.id} · ${e.area} · ${e.kind} → ${store.file}`)
    );
  }

  const led = store.load();
  const views = led.entries.map(entryView);
  const obs = store.readObs();

  // ── match — the executor block, the v1 rule ──
  if (sub === "match") {
    const files = filesArg();
    if (!files.length) return fail(2, "usage", "gotcha match: --files <csv> is required");
    // The v0.40.0 key stays for compatibility (DE-27): a 1.x config that says
    // `gotchas: off` is never silently overridden for the EXECUTOR slice. The
    // reviewer card has no off answer (DE-10).
    if (String(cfg().gotchas) === "off")
      return out({ ok: true, off: true, text: "", ids: [], matched: 0, known: views.length }, 4, () => console.log("gotchas: off — no executor block"));
    const hit = views.filter((v) => v.polarity === "flag" && doLine(v, obs) && files.some((f) => inScope(v.scope, f)));
    hit.sort((a, b) => b.hits - a.hits || dateMs(b.last_seen) - dateMs(a.last_seen));
    const top = hit.slice(0, MATCH_CAP);
    const text = top.map((v) => v.raw.text).join("\n\n");
    return out({ ok: true, text, ids: top.map((v) => v.id), matched: hit.length, known: views.length }, top.length ? 0 : 1, () =>
      console.log(top.length ? text : `no gotcha matches these files (${views.length} known) — no block`)
    );
  }

  // ── card — the reviewer card, ALWAYS built when anything matches ──
  if (sub === "card") {
    const files = filesArg();
    if (!files.length) return fail(2, "usage", "gotcha card: --files <csv> is required");
    const lane = valueOf("--lane") || null;
    const budget = Math.max(CARD_BUDGET_MIN, Number(cfg().gotcha_card_budget) || CARD_BUDGET_DEFAULT);
    const tracked = trackedFiles(repoRoot);
    const orphaned = [];
    let quiet = 0;
    const rows = [];
    for (const v of views) {
      if (!files.some((f) => inScope(v.scope, f))) continue;
      const why = orphanReason(v, tracked, repoRoot);
      if (why) {
        orphaned.push({ id: v.id, why });
        continue;
      }
      if (isQuiet(v, now)) {
        quiet++;
        continue;
      }
      const miss = obs.some((o) => o.miss === true && linksTo(o, v));
      if (v.polarity === "suppress") rows.push({ id: v.id, type: "suppress", text: suppressLine(v), rank: rankOf(v, now), first: false });
      else rows.push({ id: v.id, type: "flag", text: lineFor(v), rank: rankOf(v, now), first: miss || v.category === "security", miss });
    }
    const cands = candidates(led.entries, obs, now).filter((c) => c.watch && files.some((f) => inScope(c.scope, f)));
    for (const c of cands)
      rows.push({ id: c.id, type: "watch", text: watchLine(c), rank: (SEV_W[c.severity] || 2) * Math.log(1 + c.addressed) * specificity(c.scope), first: false });
    // v2.1.0 §4.2 item 5 — ONE `fix` line per changed file that has a fix
    // record in the window: the newest, a miss first. Inside the budget; a line
    // that does not fit is counted like any other.
    const fixes = fixesIn(obs, WINDOW_DAYS, now);
    for (const f of files) {
      const mine = fixes.filter((o) => o.path === f);
      if (!mine.length) continue;
      mine.sort((a, b) => (b.miss ? 1 : 0) - (a.miss ? 1 : 0) || String(b.at).localeCompare(String(a.at)));
      rows.push({ id: "fix:" + f, type: "fix", text: fixLine(mine[0], mine.length), rank: mine.length, first: !!mine[0].miss, miss: !!mine[0].miss });
    }
    const byRank = (a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0) || b.rank - a.rank || a.id.localeCompare(b.id);
    const ordered = rows.filter((r) => r.type === "flag").sort(byRank)
      .concat(rows.filter((r) => r.type === "fix").sort(byRank))
      .concat(rows.filter((r) => r.type === "watch").sort(byRank))
      .concat(rows.filter((r) => r.type === "suppress").sort(byRank));
    const matched = ordered.length;
    if (!matched)
      return out({ ok: true, lane, text: "", ids: [], matched: 0, known: views.length, dropped: 0, orphaned: orphaned.map((o) => o.id), quiet, budget, tokens: 0 }, 1, () =>
        console.log(`no gotcha matches these files (${views.length} known) — no card`)
      );
    const kept = [];
    let nFlag = 0;
    let nWatch = 0;
    let nSup = 0;
    const headerFor = (n, d) => `gotchas (${n} of ${views.length} match${d ? ` · ${d} dropped by budget` : ""}):`;
    for (const r of ordered) {
      if (r.type === "watch" && nWatch >= CARD_WATCH_CAP) {
        r.dropped = "watch cap";
        continue;
      }
      if ((r.type === "flag" || r.type === "watch") && nFlag + nWatch >= CARD_FLAG_CAP) {
        r.dropped = "line cap";
        continue;
      }
      if (r.type === "suppress" && nSup >= CARD_SUPPRESS_CAP) {
        r.dropped = "suppress cap";
        continue;
      }
      const trial = [headerFor(matched, matched - kept.length - 1)].concat(kept.map((k) => k.text), r.text).join("\n");
      if (estTokens(trial) > budget) {
        r.dropped = "token budget";
        continue;
      }
      kept.push(r);
      if (r.type === "flag") nFlag++;
      else if (r.type === "watch") nWatch++;
      else if (r.type === "suppress") nSup++;
    }
    const dropped = matched - kept.length;
    const text = [headerFor(matched, dropped)].concat(kept.map((k) => k.text)).join("\n");
    const payload = {
      ok: true,
      lane,
      text,
      ids: kept.map((k) => k.id),
      matched,
      known: views.length,
      dropped,
      orphaned: orphaned.map((o) => o.id),
      quiet,
      budget,
      tokens: estTokens(text),
    };
    // BRIEF by default (T17 b): `text` + counts. `--full` adds every row.
    if (args.includes("--full"))
      Object.assign(payload, {
        rows: ordered.map((r) => ({ id: r.id, type: r.type, text: r.text, rank: Math.round(r.rank * 1000) / 1000, miss: !!r.miss, kept: !r.dropped, dropped: r.dropped || null })),
        orphaned_rows: orphaned,
      });
    return out(payload, 0, () => {
      console.log(text);
      if (orphaned.length) console.log(`  (${orphaned.length} orphaned, left out: ${orphaned.map((o) => o.id).join(", ")})`);
    });
  }

  // ── filter — after the review; NEVER touches a P0 or P1 ──
  if (sub === "filter") {
    const inp = readInput(valueOf("--findings"));
    if (inp.err) return fail(2, "malformed", `gotcha filter: --findings ${inp.err}`, { field: "findings" });
    const list = Array.isArray(inp.value) ? inp.value : inp.value && Array.isArray(inp.value.findings) ? inp.value.findings : null;
    if (!list) return fail(2, "malformed", "gotcha filter: --findings must be a JSON array (or {findings: [...]})", { field: "findings" });
    const sevOf = (f) => String((f && (f.severity || f.priority)) || "").toUpperCase();
    const pathOf = (f) => posix((f && (f.path || f.file)) || "");
    const gating = (f) => sevOf(f) === "P0" || sevOf(f) === "P1";
    const removed = [];
    const suppressed = {};
    let rest = [];
    const sup = views.filter((v) => v.polarity === "suppress" && v.category);
    for (const f of list) {
      if (!gating(f) && ["P2", "P3"].includes(sevOf(f))) {
        const by = sup.find((v) => v.category === (f && f.category) && pathOf(f) && inScope(v.scope, pathOf(f)));
        if (by) {
          removed.push({ finding: f, by: by.id });
          suppressed[by.id] = (suppressed[by.id] || 0) + 1;
          continue;
        }
      }
      rest.push(f);
    }
    // P3 capped at 5; the rest fold into `+N similar`.
    let p3 = 0;
    let folded = 0;
    rest = rest.filter((f) => {
      if (sevOf(f) !== "P3") return true;
      p3++;
      if (p3 <= P3_CAP) return true;
      folded++;
      removed.push({ finding: f, by: "fold" });
      return false;
    });
    // The per-category noise budget from `quality`.
    const q = quality(obs, led.entries, WINDOW_DAYS, now);
    const noisy = new Set(q.categories.filter((c) => c.noisy).map((c) => c.category));
    const seenNoisy = {};
    rest = rest.filter((f) => {
      const cat = f && f.category;
      if (gating(f) || !noisy.has(cat)) return true;
      seenNoisy[cat] = (seenNoisy[cat] || 0) + 1;
      if (seenNoisy[cat] <= 1) return true;
      removed.push({ finding: f, by: `noise:${cat}` });
      return false;
    });
    const payload = { ok: true, kept: rest, removed, folded, suppressed, noisy: [...noisy], counts: { in: list.length, kept: rest.length, removed: removed.length } };
    return out(payload, 0, () => {
      console.log(`gotcha filter: ${list.length} in · ${rest.length} kept · ${removed.length} removed${folded ? ` (+${folded} similar P3 folded)` : ""}`);
      for (const r of removed) console.log(`  removed by ${r.by}: ${oneLine((r.finding && (r.finding.title || r.finding.summary || r.finding.id)) || "(finding)")}`);
    });
  }

  // ── observe — append one observation, then promotion ──
  if (sub === "observe") {
    const inp = readInput(pos[2] || (args.includes("-") ? "-" : undefined));
    if (inp.err) return fail(2, "malformed", `gotcha observe: the input ${inp.err}`, { field: "body" });
    // v2.1.0 DE-13 — a review close stores the ranges it read. Not an
    // observation: it goes to review-scope.jsonl, which `orc fix record` reads.
    if (inp.value && inp.value.kind === "review-scope") {
      const s = normalizeScope(inp.value, now);
      if (s.err) return fail(2, "malformed", `gotcha observe: review-scope field \`${s.field}\` ${s.err}`, { field: s.field });
      const w = recordScope(claudeDir, s.row);
      return out({ ok: true, kind: "review-scope", run: s.row.run, files: Object.keys(s.row.files).length, kept: w.kept, dropped: w.dropped, cap: SCOPE_CAP, file: scopeFile(claudeDir) }, 0, () =>
        console.log(`✓ review scope stored for ${s.row.run} (${Object.keys(s.row.files).length} file(s) · ${w.kept} of the last ${SCOPE_CAP} reviews kept${w.dropped ? ` · ${w.dropped} older dropped` : ""})`)
      );
    }
    const n = normalizeObservation(inp.value, now);
    if (n.err) return fail(2, "malformed", `gotcha observe: field \`${n.field}\` ${n.err}`, { field: n.field });
    let o = n.o;
    if (isFixRecord(o) && !o.miss) o = applyMiss(claudeDir, o, NaN);
    const { recorded, changes, all } = recordObservations(store, led, [o], now);
    const prev = recorded[0].prev;
    o = recorded[0].o;
    const after = candidates(led.entries, all, now);
    const mine = after.find((c) => c.obs.includes(o.obs));
    const payload = {
      ok: true,
      obs: o.obs,
      replaced: !!prev,
      observation: o,
      candidate: mine ? publicCand(mine) : null,
      watch: !!(mine && mine.watch),
      bumped: changes.bumped,
      promoted: changes.promoted,
      helpful: changes.helpful,
      harmful: changes.harmful,
      file: store.obsFile,
    };
    return out(payload, 0, () => {
      console.log(`✓ observed ${o.obs.slice(0, 8)} (${o.source} · ${o.outcome})${prev ? " — replaces the earlier line" : ""}`);
      for (const p of changes.promoted) console.log(`  promoted ${p.candidate} → ${p.id}: ${p.why}`);
      for (const id of changes.bumped) console.log(`  bumped ${id}`);
      if (mine) console.log(`  candidate ${mine.id}: ${mine.needs || "ready"}`);
    });
  }

  // ── list --candidates ──
  if (sub === "list" && args.includes("--candidates")) {
    const cands = candidates(led.entries, obs, now).map(publicCand);
    const tracked = trackedFiles(repoRoot);
    const orphaned = views.map((v) => ({ id: v.id, why: orphanReason(v, tracked, repoRoot) })).filter((x) => x.why);
    const quiet = views.filter((v) => isQuiet(v, now)).map((v) => v.id);
    const retire = views.filter((v) => v.harmful >= 3 && v.harmful >= v.helpful).map((v) => ({ id: v.id, helpful: v.helpful, harmful: v.harmful, proposal: "retire — ORC never applies it; delete the block yourself" }));
    const payload = {
      ok: true,
      count: cands.length,
      candidates: cands.filter((c) => c.kind === "candidate"),
      suppressions: cands.filter((c) => c.kind === "suppression"),
      project_actions: cands.filter((c) => c.kind === "project-action"),
      retire,
      quiet,
      orphaned,
      observations: obs.length,
      rules: { cases: PROMOTE_CASES, prs: PROMOTE_PRS, window_days: WINDOW_DAYS, jaccard_min: JACCARD_MIN, suppress_disputes: SUPPRESS_DISPUTES, do_line_cases: DO_LINE_CASES },
    };
    return out(payload, cands.length ? 0 : 1, () => {
      if (!cands.length) console.log(`no candidates (${obs.length} observation${obs.length === 1 ? "" : "s"})`);
      for (const c of cands) console.log(`  ${c.id} · ${c.kind} · ${c.rule || c.sig} · ${c.scope || "(no scope)"} · ${c.addressed} addressed / ${c.disputed} disputed\n      ${c.needs || "ready"}`);
      for (const r of retire) console.log(`  retire? ${r.id} — harmful ${r.harmful}, helpful ${r.helpful}`);
    });
  }

  // ── accept <C-id> ──
  if (sub === "accept") {
    const id = String(pos[2] || "").trim();
    const c = candidates(led.entries, obs, now).find((x) => x.id === id);
    if (!c) return fail(2, "unknown", `gotcha accept: no candidate "${id}". See: orc gotcha list --candidates`, { id: id || null });
    if (c.kind === "project-action") return fail(2, "lint-rule", `gotcha accept: ${id} is a lint rule — turn the linter rule on (${c.rule}); it is never a review item`, { id });
    if (!c.scope) return fail(2, "no-scope", `gotcha accept: ${id} has no scope — ${c.scope_refused}`, { id });
    const e = appendEntry(store, led, entryFromCandidate(c, "accepted by a person", now));
    if (!e) return fail(2, "ids-exhausted", "gotcha accept: G-999 is the last id the heading allows.", { id });
    store.save(led);
    return out({ ok: true, candidate: id, id: e.id, polarity: e.fields.polarity, file: store.file, text: e.text }, 0, () => console.log(`✓ ${id} → ${e.id} (${e.fields.polarity})`));
  }

  // ── quality ──
  if (sub === "quality") {
    const w = Number(valueOf("--window"));
    const windowDays = Number.isInteger(w) && w > 0 ? w : WINDOW_DAYS;
    const q = quality(obs, led.entries, windowDays, now, tracedReviewRuns(claudeDir, deps, windowDays, now));
    return out(Object.assign({ ok: true }, q), q.below_floor ? 1 : 0, () => {
      if (q.below_floor) console.log(`gotcha quality: ${q.reviews} review(s) in ${windowDays} days — below the ${QUALITY_FLOOR}-review floor, no answer yet`);
      for (const c of q.categories) console.log(`  ${c.category.padEnd(28)} ${c.findings} findings · acceptance ${c.acceptance === null ? "—" : Math.round(c.acceptance * 100) + " %"}${c.noisy ? " · noisy" : ""}`);
    });
  }

  // ── why <G-id|C-id> ──
  if (sub === "why") {
    const id = String(pos[2] || "").trim().toUpperCase();
    let list = null;
    let kind = null;
    const v = views.find((x) => x.id === id);
    if (v) {
      kind = "gotcha";
      list = obs.filter((o) => o.gotcha === id || linksTo(o, v));
    } else {
      const c = candidates(led.entries, obs, now).find((x) => x.id.toUpperCase() === id);
      if (c) {
        kind = c.kind;
        list = c._cases;
      }
    }
    if (!list) return fail(2, "unknown", `gotcha why: no gotcha or candidate "${pos[2] || ""}"`, { id: pos[2] || null });
    return out({ ok: true, id, kind, count: list.length, observations: list, origin: v ? v.origin : null }, 0, () => {
      console.log(`${id} (${kind}) — ${list.length} observation${list.length === 1 ? "" : "s"}${v && v.origin ? " · origin: " + v.origin : ""}`);
      for (const o of list) console.log(`  ${o.at} · ${o.source} · ${o.outcome} · ${o.path || "-"} · ${o.rule || o.sig || ""}`);
    });
  }

  // ── export --review-md (DE-15) ──
  if (sub === "export") {
    if (!args.includes("--review-md")) return fail(2, "usage", "gotcha export: only --review-md is supported");
    const tracked = trackedFiles(repoRoot);
    const live = views.filter((v) => !orphanReason(v, tracked, repoRoot));
    const flags = live.filter((v) => v.polarity === "flag").sort((a, b) => b.hits - a.hits || a.id.localeCompare(b.id));
    const sups = live.filter((v) => v.polarity === "suppress");
    const md = [
      "# REVIEW.md — what this project has already gotten wrong",
      "",
      "Generated by `orc gotcha export --review-md` from `.claude/orc/gotchas.md`. Do not edit here: edit the ledger and export again.",
      "",
    ];
    if (flags.length) md.push("## Always check", "", ...flags.map((v) => `- ${lineFor(v)}`), "");
    if (sups.length) md.push("## Do not flag", "", ...sups.map((v) => `- ${suppressLine(v)}`), "");
    const markdown = md.join("\n");
    const count = flags.length + sups.length;
    return out({ ok: true, count, ids: flags.concat(sups).map((v) => v.id), markdown }, count ? 0 : 1, () =>
      process.stdout.write(count ? markdown : "no active gotchas — nothing to export\n")
    );
  }

  return fail(sub ? 2 : 1, "usage", USAGE);
}

module.exports = {
  KINDS,
  SOURCE_KIND,
  V1_SOURCES,
  IN_LANE_SOURCES,
  CATEGORIES,
  REQUIRED,
  OPTIONAL,
  JACCARD_MIN,
  WINDOW_DAYS,
  CARD_BUDGET_DEFAULT,
  CARD_BUDGET_MIN,
  globRe,
  inScope,
  deriveScope,
  normalizeSig,
  jaccard,
  promotion,
  candidates,
  validateAdd,
  renderEntry,
  entryView,
  quality,
  panelView,
  STATUSES,
  gotchaCmd,
  USAGE,
  // W6a — the importers (bin/gotcha-import.js) record through these.
  makeStore,
  normalizeObservation,
  recordObservations,
  // v2.1.0 W6 — `orc fix` (bin/fix.js) records through these.
  INTRODUCED_BY,
  FIX_CAUSES,
  SCOPE_CAP,
  isFixRecord,
  readScopes,
  normalizeScope,
  recordScope,
  findMiss,
  applyMiss,
  fixesIn,
  fixLine,
  dateMs,
  redact,
  sha1,
};
