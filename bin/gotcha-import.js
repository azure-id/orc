"use strict";
// ── The gotcha importers + the read-only `gh` reads (v2.0.0 W6a) ────────────
//
//   orc gotcha import sarif <file>          SARIF 2.1.0 → observations
//   orc gotcha import sonar [...]           Sonar REST (or --file <saved answer>) → observations
//   orc gotcha import pr <n>                PR review threads (humans only) → observations
//   orc gotcha import issues [--label bug]  closed defects with a closing PR → observations
//   orc gotcha sync [--force]               every available source, incremental, time-boxed
//   orc pr threads <n> [--all]              the unresolved review threads, for real (Q1)
//   orc ci failed [--pr <n>|--run <id>]     the failing CI steps, flaky re-attempts named (Q3)
//   orc ci flaky --first <log> [--rerun <log>]  a LOCAL red run: flaky or real (Q5, W6b)
//
// Every importer is a PURE parser (exported, tested against test/fixtures/)
// plus a thin network half. The parsers never decide an outcome by judgement:
// `05-gotchas-v2-spec.md` §3.1 is a table, and it is coded as one.
//
// The importers FEED `observe` (bin/gotcha.js `recordObservations`) — one
// writer of observations.jsonl, one promotion pass. They never write a
// gotchas.md entry themselves: promotion (§4) does, or a person does.
//
// Network: the user's own `gh` (a READ, always — never a reply, a resolve or a
// review) and Node's `fetch` for Sonar. No new dependency. The Sonar token
// comes from SONAR_TOKEN in the ENVIRONMENT only: never a config key, never
// printed, never in a URL (it rides in the Authorization header).
//
// State: `.claude/orc/gotchas-sync.json` (last_sync, per-source cursors, the
// last SARIF fingerprints). User data — never in the install manifest, so
// `orc update`, `--prune` and `doctor --fix` never touch it.
//
// Test seams: ORC_GH (the `gh` binary; a .js path runs through node) and
// ORC_TEST_SYNC_BOX_MS (the per-source time box, 10 s by default).

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const G = require("./gotcha.js");

const SYNC_BOX_MS = Number(process.env.ORC_TEST_SYNC_BOX_MS) || 10000;
const SONAR_PAGE = 500;
const SONAR_CAP = 10000; // the API's hard result cap — sliced by createdAfter
const FIRST_MAX = 300; // the first comment, marked as untrusted data
const CI_TAIL = 60; // last lines per job
const CI_ERR_MAX = 8; // error lines kept per failure
const SARIF_FP_MAX = 5000;
const VALUE_FLAGS = new Set(["--url", "--project", "--pr", "--branch", "--org", "--file", "--label", "--run", "--dir", "--limit", "--first", "--rerun", "--rerun-exit"]);

// ── Small helpers ───────────────────────────────────────────────────────────
const oneLine = (v) => String(v == null ? "" : v).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const clip = (s, n) => {
  const t = oneLine(s);
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
const safe = (s, n) => clip(G.redact(s), n || FIRST_MAX);
const posix = (p) => String(p || "").replace(/\\/g, "/").replace(/^\.\//, "");
const isBotLogin = (login, typename) => typename === "Bot" || /\[bot\]$/i.test(String(login || ""));
const isTestPath = (p) => /(^|\/)(tests?|__tests__|spec)\//i.test(p) || /\.(test|spec)\.[a-z]+$/i.test(p);

// Concatenated JSON values (`gh --paginate` prints one document per page) or a
// single value → an array of values. Throws on anything that is not JSON.
function parseJsonStream(text) {
  const t = String(text || "").replace(/^﻿/, "").trim();
  if (!t) return [];
  const out = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let start = -1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) out.push(JSON.parse(t.slice(start, i + 1)));
    }
  }
  if (depth !== 0 || !out.length) return [JSON.parse(t)];
  return out;
}

// Pages that are arrays → one flat array; pages that are objects stay pages.
const flatPages = (pages) => pages.reduce((acc, p) => acc.concat(Array.isArray(p) ? p : [p]), []);

// ── SARIF 2.1.0 (`05` §7 `import sarif`, §3.1) ──────────────────────────────
// `ruleId` | `ruleIndex` | `rule{id,index}` → the rule; `level` → the rule's
// default → `warning`; the first location; `partialFingerprints`;
// `baselineState`; `suppressions`. `absent` (or a fingerprint the previous
// import had and this one does not) → addressed · a non-empty `suppressions[]`
// → disputed · `new` / `unchanged` / none → open.
const LEVEL_SEV = { error: "P1", warning: "P2", note: "P3", none: "P3" };
function toolPrefix(name) {
  const n = String(name || "").toLowerCase();
  if (/eslint/.test(n)) return "eslint";
  if (/semgrep/.test(n)) return "semgrep";
  if (/ruff/.test(n)) return "ruff";
  if (/codeql/.test(n)) return "codeql";
  return n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sarif";
}
function sarifUri(loc, run) {
  const al = loc && loc.physicalLocation && loc.physicalLocation.artifactLocation;
  if (!al) return null;
  let uri = al.uri;
  if (!uri && Number.isInteger(al.index) && run.artifacts && run.artifacts[al.index]) {
    const a = run.artifacts[al.index].location;
    uri = a && a.uri;
  }
  if (!uri) return null;
  let p = decodeURIComponent(String(uri)).replace(/^file:\/\/\/?/, "");
  // A uriBaseId makes the uri RELATIVE to a root the tool named — keep it relative.
  if (/^[A-Za-z]:\//.test(p) || p.startsWith("/")) {
    const base = al.uriBaseId && run.originalUriBaseIds && run.originalUriBaseIds[al.uriBaseId];
    const root = base && base.uri ? decodeURIComponent(base.uri).replace(/^file:\/\/\/?/, "") : null;
    if (root && p.startsWith(root)) p = p.slice(root.length);
  }
  return posix(p);
}
function parseSarif(doc, previous) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.runs) || !/^2\.1\./.test(String(doc.version || "")))
    return { err: "not SARIF 2.1.0 (it needs `version: 2.1.0` and a `runs[]` array)" };
  const items = [];
  const seen = {};
  for (const run of doc.runs) {
    const driver = (run.tool && run.tool.driver) || {};
    const tool = toolPrefix(driver.name);
    const rules = Array.isArray(driver.rules) ? driver.rules : [];
    seen[tool] = seen[tool] || {};
    for (const r of Array.isArray(run.results) ? run.results : []) {
      const idx = Number.isInteger(r.ruleIndex) ? r.ruleIndex : r.rule && Number.isInteger(r.rule.index) ? r.rule.index : null;
      const desc = idx !== null && rules[idx] ? rules[idx] : rules.find((x) => x.id === (r.ruleId || (r.rule && r.rule.id))) || null;
      const ruleId = r.ruleId || (r.rule && r.rule.id) || (desc && desc.id) || null;
      const level = r.level || (desc && desc.defaultConfiguration && desc.defaultConfiguration.level) || "warning";
      let text = r.message && r.message.text;
      if (!text && r.message && r.message.id && desc && desc.messageStrings && desc.messageStrings[r.message.id])
        text = desc.messageStrings[r.message.id].text;
      if (!text && desc) text = (desc.shortDescription && desc.shortDescription.text) || (desc.fullDescription && desc.fullDescription.text);
      const loc = Array.isArray(r.locations) ? r.locations[0] : null;
      const file = sarifUri(loc, run);
      const region = (loc && loc.physicalLocation && loc.physicalLocation.region) || {};
      const lines = Number.isInteger(region.startLine) ? [region.startLine].concat(Number.isInteger(region.endLine) && region.endLine !== region.startLine ? [region.endLine] : []) : null;
      const pf = r.partialFingerprints && Object.values(r.partialFingerprints)[0];
      const fp = String(pf || r.fingerprints && Object.values(r.fingerprints)[0] || G.sha1(`${ruleId}|${file}|${region.startLine}|${text}`)).slice(0, 40);
      const tags = [].concat((desc && desc.properties && desc.properties.tags) || [], (r.properties && r.properties.tags) || []).map(String);
      const cweTag = tags.map((t) => /CWE-(\d+)/i.exec(t)).find(Boolean);
      const security = !!cweTag || tags.some((t) => /^security$/i.test(t));
      const suppressed = Array.isArray(r.suppressions) && r.suppressions.length > 0;
      const outcome = suppressed ? "disputed" : r.baselineState === "absent" ? "addressed" : "open";
      seen[tool][fp] = { rule: ruleId, path: file, line: lines ? lines[0] : null, sig: text || null };
      items.push({
        body: {
          source: "sarif",
          ref: `sarif ${tool} · ${fp.slice(0, 16)}`,
          rule: ruleId ? `${tool}:${ruleId}` : null,
          sig: text || null,
          path: file,
          lines,
          severity: LEVEL_SEV[level] || "P2",
          category: security ? "security" : null,
          cwe: cweTag ? `CWE-${cweTag[1]}` : null,
          outcome,
          author: "bot",
        },
        view: { rule: ruleId ? `${tool}:${ruleId}` : `${tool}:(no rule)`, path: file, line: lines ? lines[0] : null, message: safe(text, 200), level, outcome, suppressed, baseline: r.baselineState || null },
      });
    }
  }
  // "compared with the previous import": a fingerprint the last import of the
  // SAME tool carried and this one does not → the finding is gone → addressed.
  for (const [tool, prevFps] of Object.entries(previous || {})) {
    if (!seen[tool]) continue; // this file says nothing about that tool
    for (const [fp, m] of Object.entries(prevFps.fps || {})) {
      if (seen[tool][fp]) continue;
      items.push({
        body: { source: "sarif", ref: `sarif ${tool} · ${fp.slice(0, 16)}`, rule: m.rule ? `${tool}:${m.rule}` : null, sig: m.sig, path: m.path, lines: Number.isInteger(m.line) ? [m.line] : null, outcome: "addressed", author: "bot" },
        view: { rule: m.rule ? `${tool}:${m.rule}` : `${tool}:(no rule)`, path: m.path, line: m.line, message: safe(m.sig, 200), level: null, outcome: "addressed", suppressed: false, baseline: "absent (vs the previous import)" },
      });
    }
  }
  const state = {};
  for (const [tool, fps] of Object.entries(seen)) {
    const keys = Object.keys(fps).slice(0, SARIF_FP_MAX);
    state[tool] = { fps: Object.fromEntries(keys.map((k) => [k, fps[k]])) };
  }
  return { items, state };
}

// ── Sonar (`05` §7 `import sonar`, §3.1) ────────────────────────────────────
// issueStatus: FIXED → addressed · FALSE_POSITIVE → disputed · ACCEPTED →
// wontfix · OPEN / CONFIRMED → open. A pre-10.4 answer has only
// status + resolution; it maps the same way.
const SONAR_SEV = { BLOCKER: "P1", HIGH: "P1", CRITICAL: "P1", MEDIUM: "P2", MAJOR: "P2", LOW: "P3", MINOR: "P3", INFO: "P3" };
const IMPACT_RANK = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, BLOCKER: 4 };
function sonarOutcome(i) {
  const s = String(i.issueStatus || "").toUpperCase();
  if (s === "FIXED") return "addressed";
  if (s === "FALSE_POSITIVE") return "disputed";
  if (s === "ACCEPTED") return "wontfix";
  if (s === "OPEN" || s === "CONFIRMED") return "open";
  const res = String(i.resolution || "").toUpperCase();
  if (res === "FIXED" || res === "REMOVED") return "addressed";
  if (res === "FALSE-POSITIVE") return "disputed";
  if (res === "WONTFIX") return "wontfix";
  return "open";
}
function parseSonar(pages, opts) {
  const list = flatPages(Array.isArray(pages) ? pages : [pages]);
  if (!list.length || !list.every((p) => p && typeof p === "object" && Array.isArray(p.issues)))
    return { err: "not a Sonar api/issues/search answer (it needs an `issues[]` array)" };
  const comps = {};
  const ruleNames = {};
  for (const p of list) {
    for (const c of p.components || []) comps[c.key] = c.path || null;
    for (const r of p.rules || []) ruleNames[r.key] = r.name || null;
  }
  const items = [];
  const seenKeys = new Set();
  for (const p of list)
    for (const i of p.issues) {
      if (!i || !i.key || seenKeys.has(i.key)) continue;
      seenKeys.add(i.key);
      const file = comps[i.component] || (String(i.component || "").includes(":") ? String(i.component).split(":").slice(1).join(":") : null);
      const tr = i.textRange || {};
      const start = Number.isInteger(tr.startLine) ? tr.startLine : Number.isInteger(i.line) ? i.line : null;
      const lines = start === null ? null : [start].concat(Number.isInteger(tr.endLine) && tr.endLine !== start ? [tr.endLine] : []);
      const impacts = Array.isArray(i.impacts) ? i.impacts : [];
      const top = impacts.reduce((m, x) => (IMPACT_RANK[String(x.severity).toUpperCase()] > IMPACT_RANK[m] || m === null ? String(x.severity).toUpperCase() : m), null);
      const security = impacts.some((x) => String(x.softwareQuality).toUpperCase() === "SECURITY") || i.type === "VULNERABILITY";
      const cweTag = (i.tags || []).map((t) => /^cwe-?(\d+)$/i.exec(String(t))).find(Boolean);
      const outcome = sonarOutcome(i);
      const rule = `sonar:${i.rule}`;
      items.push({
        body: {
          source: "sonar",
          ref: `sonar ${i.key}`,
          rule,
          sig: i.message || null,
          path: file ? posix(file) : null,
          lines,
          severity: SONAR_SEV[top] || SONAR_SEV[String(i.severity || "").toUpperCase()] || "P2",
          category: security ? "security" : null,
          cwe: cweTag ? `CWE-${cweTag[1]}` : null,
          impact: top || null,
          pr: opts && opts.pr ? String(opts.pr) : null,
          at: i.updateDate || i.creationDate || null,
          outcome,
          author: "bot",
        },
        view: { rule, name: ruleNames[i.rule] || null, key: i.key, path: file ? posix(file) : null, line: start, message: safe(i.message, 200), outcome, impact: top || i.severity || null },
        updated: i.updateDate || i.creationDate || null,
      });
    }
  return { items };
}

// ── GitHub PR review threads (`05` §3.1, `08` Q1) ───────────────────────────
// addressed = isResolved && isOutdated (the lines changed) · resolved but not
// outdated → open (a click is not a change) · unresolved at merge → wontfix.
const THREADS_QUERY =
  "query($owner:String!,$repo:String!,$n:Int!,$endCursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$n){" +
  "number title state url headRefName reviewThreads(first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{" +
  "id isResolved isOutdated path line originalLine subjectType comments(first:50){nodes{author{__typename login} authorAssociation body url createdAt}}}}}}}";
function parseThreads(pages) {
  const list = flatPages(pages);
  let pr = null;
  const threads = [];
  for (const p of list) {
    const node = p && p.data && p.data.repository && p.data.repository.pullRequest;
    if (!node) {
      if (p && p.errors) return { err: `GitHub answered with an error: ${clip(p.errors.map((e) => e.message).join("; "), 200)}` };
      continue;
    }
    pr = pr || { number: node.number, title: node.title || null, state: node.state || null, url: node.url || null, head: node.headRefName || null };
    for (const t of (node.reviewThreads && node.reviewThreads.nodes) || []) threads.push(t);
  }
  if (!pr) return { err: "not a reviewThreads answer (no data.repository.pullRequest)" };
  const rows = threads.map((t, i) => {
    const cs = (t.comments && t.comments.nodes) || [];
    const first = cs[0] || {};
    const login = first.author ? first.author.login : null;
    const kind = isBotLogin(login, first.author && first.author.__typename) ? "bot" : "human";
    const state = t.isResolved && t.isOutdated ? "resolved+outdated" : t.isResolved ? "resolved" : t.isOutdated ? "outdated" : "open";
    return {
      n: i + 1,
      id: t.id || null,
      path: t.path ? posix(t.path) : null,
      line: Number.isInteger(t.line) ? t.line : null,
      original_line: Number.isInteger(t.originalLine) ? t.originalLine : null,
      subject_type: t.subjectType || null,
      resolved: !!t.isResolved,
      outdated: !!t.isOutdated,
      state,
      author: login,
      author_kind: kind,
      association: first.authorAssociation || null,
      comments: cs.length,
      first: { text: safe(first.body, FIRST_MAX), untrusted: true },
      url: first.url || null,
      created_at: first.createdAt || null,
    };
  });
  return { pr, rows };
}
function threadOutcome(row, prState) {
  if (row.resolved && row.outdated) return "addressed";
  if (!row.resolved && String(prState).toUpperCase() === "MERGED") return "wontfix";
  return "open";
}
function threadObservations(pr, rows) {
  return rows
    .filter((r) => r.author_kind === "human" && (r.first.text || r.path))
    .map((r) => ({
      source: "pr",
      ref: `PR ${pr.number} · thread ${String(r.id || r.n).slice(-24)}`,
      pr: String(pr.number),
      sig: r.first.text || null,
      path: r.path,
      lines: Number.isInteger(r.line || r.original_line) ? [r.line || r.original_line] : null,
      at: r.created_at,
      outcome: threadOutcome(r, pr.state),
      author: "human",
    }));
}

// ── Issues (defects) (`05` §3.1) ────────────────────────────────────────────
// stateReason COMPLETED with a closing PR → addressed (the PR's files are the
// scope) · NOT_PLANNED → disputed · anything else says nothing.
function issueObservations(issues, filesOf) {
  const out = [];
  for (const i of issues || []) {
    const reason = String(i.stateReason || "").toUpperCase();
    const prs = (i.closedByPullRequestsReferences || []).map((p) => p && p.number).filter(Number.isInteger);
    if (reason === "COMPLETED" && prs.length) {
      const files = (filesOf(prs[0]) || []).map(posix).filter(Boolean);
      const main = files.find((f) => !isTestPath(f)) || files[0] || null;
      out.push({ source: "defect", ref: `issue #${i.number}`, pr: String(prs[0]), sig: i.title || null, path: main, at: i.closedAt || null, outcome: "addressed", author: "human" });
    } else if (reason === "NOT_PLANNED") {
      out.push({ source: "defect", ref: `issue #${i.number}`, sig: i.title || null, at: i.closedAt || null, outcome: "disputed", author: "human" });
    }
  }
  return out;
}

// ── CI logs (`08` Q3) ───────────────────────────────────────────────────────
// `gh run view <id> --log-failed` prints `<job>\t<step>\t<timestamp> <text>`.
// Per failed step: the step name, the first error lines of the last 60 lines
// of its job, a SIGNATURE (timestamps, SHAs, temp paths and numbers removed,
// then hashed), and the tests it names. A test that failed and then PASSED on
// a re-attempt inside the same log is FLAKY — never a failure.
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const TS = /^﻿?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/;
const ERR_RE = /(##\[error\]|\berror\b|\bfailed\b|\bfailure\b|\bFAIL\b|✘|✗|×|AssertionError|Exception|Traceback|exit code [1-9]|exited with code [1-9])/i;
const NOT_ERR_RE = /\b0 (?:failed|failures|errors?)\b|--fail-fast|continue-on-error/i;
const LOCAL_CMD_RE =
  /\b(npm (?:run )?test(?::[\w-]+)?|npm run [\w:-]+|yarn (?:run )?[\w:-]+|pnpm (?:run )?[\w:-]+|npx [\w@/.-]+(?: test)?|python -m pytest|pytest(?: [\w./:-]+)?|go test(?: [\w./-]+)?|cargo test|mvnw? [\w:-]+|\.?\/?gradlew? [\w:-]+|make [\w-]+|dotnet test|bundle exec rspec|rspec|(?:vendor\/bin\/)?phpunit)\b/;
const RETRY_RE = /\s*\((?:retry|attempt) #?\d+\)/gi;
const DUR_RE = /\s*[([]\d+(?:\.\d+)?\s*(?:ms|s|m)[)\]]\s*$/i;
function testName(s) {
  return String(s).replace(RETRY_RE, "").replace(DUR_RE, "").replace(/\s+/g, " ").trim();
}
// One line → { status: "fail"|"pass", name } | null.
function testLine(l) {
  let m = /^\s*(?:\d+\)\s*)?(✘|✗|×|FAIL(?:ED)?|RERUN)\s+(.+)$/.exec(l);
  if (m) return { status: "fail", name: testName(m[2]) };
  m = /^\s*(?:\d+\)\s*)?(✓|✔|PASS(?:ED)?|ok)\s+(.+)$/.exec(l);
  if (m) return { status: "pass", name: testName(m[2]) };
  m = /^\s*(\S+::\S+)\s+(PASSED|FAILED|RERUN|ERROR)\b/.exec(l);
  if (m) return { status: m[2] === "PASSED" ? "pass" : "fail", name: testName(m[1]) };
  return null;
}
function ciSignature(parts) {
  const norm = parts
    .join("\n")
    .replace(TS, "")
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g, " ")
    .replace(/\b[0-9a-f]{7,40}\b/gi, " ")
    .replace(/(?:[A-Za-z]:)?[\\/](?:tmp|temp|var[\\/]folders|Users[\\/][^\\/\s]+[\\/]AppData[\\/]Local[\\/]Temp|home[\\/]runner[\\/]work[\\/]_temp)[\\/][^\s:'")]*/gi, " <tmp> ")
    .replace(/\d+(?:\.\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return G.sha1(norm).slice(0, 12);
}
// `/home/runner/work/<repo>/<repo>/src/x.js`, `D:/a/<repo>/<repo>/src/x.js` or a
// `_temp` copy → `src/x.js`. A path still absolute says nothing about THIS repo.
function repoRel(p) {
  const s = posix(p)
    .replace(/^.*?\/home\/runner\/work\/_temp\/[^/]+\//, "")
    .replace(/^.*?\/home\/runner\/work\/[^/]+\/[^/]+\//, "")
    .replace(/^[A-Za-z]:\/a\/[^/]+\/[^/]+\//, "");
  return /^(\/|[A-Za-z]:\/)/.test(s) ? null : s;
}
function parseCiLog(text) {
  const jobs = new Map();
  for (const raw of String(text || "").replace(/\r\n/g, "\n").split("\n")) {
    if (!raw.trim()) continue;
    const cols = raw.split("\t");
    const job = cols.length >= 3 ? cols[0] : "(job)";
    const step = cols.length >= 3 ? cols[1] : "(step)";
    const body = (cols.length >= 3 ? cols.slice(2).join("\t") : raw).replace(TS, "").replace(ANSI, "");
    if (!jobs.has(job)) jobs.set(job, { job, steps: new Map(), lines: [] });
    const j = jobs.get(job);
    j.lines.push({ step, body });
    if (!j.steps.has(step)) j.steps.set(step, []);
    j.steps.get(step).push(body);
  }
  const failures = [];
  for (const j of jobs.values()) {
    // Test statuses over the WHOLE job log, in order: the last word per test wins.
    const status = new Map();
    const failedOnce = new Set();
    let summaryFlaky = false;
    for (const { body } of j.lines) {
      const t = testLine(body);
      if (t) {
        if (t.status === "fail") failedOnce.add(t.name);
        status.set(t.name, t.status);
      }
      if (/\b\d+ flaky\b/i.test(body)) summaryFlaky = true;
    }
    const flakyTests = [...failedOnce].filter((n) => status.get(n) === "pass");
    const failedTests = [...failedOnce].filter((n) => status.get(n) === "fail");
    const tail = j.lines.slice(-CI_TAIL);
    for (const [step, bodies] of j.steps) {
      const inTail = tail.filter((x) => x.step === step).map((x) => x.body);
      const errLines = inTail
        .filter((b) => ERR_RE.test(b) && !NOT_ERR_RE.test(b))
        .filter((b) => !flakyTests.some((n) => b.includes(n)))
        .slice(0, CI_ERR_MAX)
        .map((b) => safe(b, 240));
      const stepFailed = failedTests.filter((n) => bodies.some((b) => b.includes(n)));
      const stepFlaky = flakyTests.filter((n) => bodies.some((b) => b.includes(n)));
      if (!errLines.length && !stepFailed.length && !stepFlaky.length) continue;
      const cmd = LOCAL_CMD_RE.exec(step) || LOCAL_CMD_RE.exec(bodies.join("\n"));
      const flaky = !stepFailed.length && stepFlaky.length > 0;
      const signature = ciSignature([step].concat(stepFailed.length ? stepFailed : errLines));
      // The first source anchor the step printed, the runner's checkout prefix removed.
      const fileRef = bodies
        .map((b) => /([\w./\\:-]+\.(?:js|jsx|ts|tsx|mjs|cjs|py|go|rb|rs|java|kt|cs|php|vue|svelte)):(\d+)/.exec(b))
        .find((m) => m && repoRel(m[1]));
      failures.push({
        job: j.job,
        step,
        lines: errLines,
        tests_failed: stepFailed,
        tests_flaky: stepFlaky,
        flaky,
        flaky_reason: flaky ? `${stepFlaky.length} test(s) failed and then passed on a re-attempt in the same log` : null,
        summary_flaky: summaryFlaky,
        signature,
        rule: `ci:${signature}`,
        path: fileRef ? repoRel(fileRef[1]) : null,
        line: fileRef ? Number(fileRef[2]) : null,
        repro: cmd ? cmd[1] : "none",
        repro_reason: cmd ? null : "the failing step names no local command",
      });
    }
  }
  return failures;
}

// ── The flaky classifier (v2.0.0 W6b, 08 Q5) ────────────────────────────────
// ONE definition of flaky, shared with `parseCiLog`: a test that failed and
// then passed. Here the "then" is an identical re-run of ONLY the failing
// tests. `testLine` reads both logs, so a runner the CI parser understands is
// a runner this understands, and the last word per test wins in each log.
function testStatuses(text) {
  const status = new Map();
  for (const raw of String(text || "").replace(/\r\n/g, "\n").split("\n")) {
    const t = testLine(raw.replace(TS, "").replace(ANSI, ""));
    if (t) status.set(t.name, t.status);
  }
  return status;
}
// → { state: flaky|red|unknown, tests_failed, flaky, still_failing, missing, reason }
// `rerunText` null → the first log only: it names what to re-run. A re-run that
// exited ≠ 0 (`rerunExit`) is red, whatever its test lines say: a build error
// names no test.
function classifyRerun(firstText, rerunText, rerunExit) {
  const first = testStatuses(firstText);
  const failed = [...first].filter(([, s]) => s === "fail").map(([n]) => n);
  const base = { tests_failed: failed, flaky: [], still_failing: [], missing: [] };
  if (!failed.length)
    return Object.assign(base, { state: "unknown", reason: "the first log names no failing test — treat the run as red" });
  if (rerunText == null)
    return Object.assign(base, { state: "red", still_failing: failed, reason: `re-run ONLY these ${failed.length} test(s) once, then call again with --rerun` });
  const again = testStatuses(rerunText);
  for (const n of failed) {
    const s = again.get(n);
    (s === "pass" ? base.flaky : s === "fail" ? base.still_failing : base.missing).push(n);
  }
  if (rerunExit != null && Number(rerunExit) !== 0)
    return Object.assign(base, { state: "red", reason: `the re-run exited ${rerunExit}` });
  if (base.still_failing.length) return Object.assign(base, { state: "red", reason: `${base.still_failing.length} test(s) failed again on the re-run` });
  if (base.missing.length) return Object.assign(base, { state: "red", reason: `${base.missing.length} test(s) did not run in the re-run — it was not identical` });
  return Object.assign(base, { state: "flaky", reason: `${base.flaky.length} test(s) failed, then passed on an identical re-run` });
}

// ── The network halves ──────────────────────────────────────────────────────
// `gh` → { ok, out } | { ok:false, code: 5|6, reason, message }. `deadline`
// (ms epoch) is the time box: a call past it is killed and says so.
function ghRun(ghArgs, cwd, deadline) {
  const bin = process.env.ORC_GH || "gh";
  const [file, argv] = /\.js$/i.test(bin) ? [process.execPath, [bin, ...ghArgs]] : [bin, ghArgs];
  const timeout = deadline ? Math.max(1, deadline - Date.now()) : 60000;
  try {
    const out = execFileSync(file, argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return { ok: true, out };
  } catch (e) {
    if (e.code === "ENOENT") return { ok: false, code: 5, reason: "gh-missing", message: "gh is not installed (https://cli.github.com)" };
    if (e.code === "ETIMEDOUT" || e.signal === "SIGTERM") return { ok: false, code: 6, reason: "timed-out", message: "gh timed out", timedOut: true };
    const err = String(e.stderr || e.message || "");
    if (/gh auth login|not logged in|authentication|HTTP 401|bad credentials/i.test(err))
      return { ok: false, code: 5, reason: "gh-not-authed", message: "gh is not logged in — run `gh auth login`" };
    return { ok: false, code: 6, reason: "gh-failed", message: `gh failed: ${safe(err.split("\n").find((l) => l.trim()) || "no message", 200)}`, stderr: err };
  }
}
function ghJson(ghArgs, cwd, deadline) {
  const r = ghRun(ghArgs, cwd, deadline);
  if (!r.ok) return r;
  try {
    return { ok: true, pages: parseJsonStream(r.out) };
  } catch (e) {
    return { ok: false, code: 6, reason: "gh-bad-json", message: `gh printed something that is not JSON (${e.message.split("\n")[0]})` };
  }
}
function fetchThreads(n, cwd, deadline) {
  const r = ghJson(["api", "graphql", "--paginate", "-F", "owner={owner}", "-F", "repo={repo}", "-F", `n=${n}`, "-f", `query=${THREADS_QUERY}`], cwd, deadline);
  if (!r.ok) return r;
  const p = parseThreads(r.pages);
  if (p.err) return { ok: false, code: 6, reason: "gh-bad-answer", message: p.err };
  return Object.assign({ ok: true }, p);
}
function fetchReviews(n, cwd, deadline) {
  const r = ghJson(["api", `repos/{owner}/{repo}/pulls/${n}/reviews`, "--paginate"], cwd, deadline);
  if (!r.ok) return r;
  const reviews = flatPages(r.pages)
    .filter((x) => x && String(x.state).toUpperCase() === "CHANGES_REQUESTED" && String(x.body || "").trim())
    .map((x) => {
      const login = x.user && x.user.login;
      return { author: login || null, author_kind: isBotLogin(login, x.user && x.user.type) ? "bot" : "human", state: "CHANGES_REQUESTED", body: { text: safe(x.body, FIRST_MAX), untrusted: true }, url: x.html_url || null };
    });
  return { ok: true, reviews };
}
function currentBranch(cwd) {
  try {
    return execFileSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch (_) {
    return null;
  }
}
// Sonar: `GET api/issues/search`, paged, the 10,000 cap sliced by createdAfter.
async function fetchSonar(o, deadline) {
  const token = process.env.SONAR_TOKEN;
  const pages = [];
  let createdAfter = o.createdAfter || null;
  const seen = new Set();
  for (let slice = 0; slice < 20; slice++) {
    let got = 0;
    let lastCreated = null;
    let total = 0;
    for (let p = 1; p * SONAR_PAGE <= SONAR_CAP; p++) {
      const q = new URLSearchParams({ components: o.project, issueStatuses: "OPEN,CONFIRMED,FALSE_POSITIVE,ACCEPTED,FIXED", additionalFields: "rules", ps: String(SONAR_PAGE), p: String(p), s: "CREATION_DATE", asc: "true" });
      if (o.pr) q.set("pullRequest", String(o.pr));
      else if (o.branch) q.set("branch", String(o.branch));
      if (o.org) q.set("organization", String(o.org));
      if (createdAfter) q.set("createdAfter", createdAfter);
      const url = String(o.url).replace(/\/+$/, "") + "/api/issues/search?" + q.toString();
      const left = deadline ? deadline - Date.now() : 60000;
      if (left <= 0) return { ok: false, code: 6, reason: "timed-out", message: "sonar timed out", timedOut: true };
      let res;
      try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(left) });
      } catch (e) {
        const to = e && (e.name === "TimeoutError" || e.name === "AbortError");
        return { ok: false, code: 6, reason: to ? "timed-out" : "network", message: to ? "sonar timed out" : `sonar is not reachable (${safe(e.cause && e.cause.code ? e.cause.code : e.message, 120)})`, timedOut: to };
      }
      if (res.status === 401 || res.status === 403) return { ok: false, code: 5, reason: "auth", message: `sonar refused the token (HTTP ${res.status}) — check SONAR_TOKEN` };
      if (!res.ok) return { ok: false, code: 6, reason: "network", message: `sonar answered HTTP ${res.status}` };
      let body;
      try {
        body = await res.json();
      } catch (_) {
        return { ok: false, code: 6, reason: "network", message: "sonar answered with something that is not JSON" };
      }
      pages.push(body);
      const issues = Array.isArray(body.issues) ? body.issues : [];
      total = Number((body.paging && body.paging.total) || body.total || 0);
      for (const i of issues) {
        if (seen.has(i.key)) continue;
        seen.add(i.key);
        got++;
        lastCreated = i.creationDate || lastCreated;
      }
      if (!issues.length || p * SONAR_PAGE >= total) return { ok: true, pages };
    }
    // The cap: start a new slice after the last creation date this one reached.
    if (!got || !lastCreated || total <= SONAR_CAP) break;
    createdAfter = lastCreated;
  }
  return { ok: true, pages };
}

// ── The sync state (`.claude/orc/gotchas-sync.json`) ────────────────────────
const statePath = (claudeDir) => path.join(claudeDir, "orc", "gotchas-sync.json");
function readState(claudeDir) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(claudeDir), "utf8"));
    return s && typeof s === "object" ? Object.assign({ version: 1, last_sync: null, sources: {}, sarif: {} }, s) : { version: 1, last_sync: null, sources: {}, sarif: {} };
  } catch (_) {
    return { version: 1, last_sync: null, sources: {}, sarif: {} };
  }
}
function writeState(claudeDir, s) {
  const f = statePath(claudeDir);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + ".tmp", JSON.stringify(s, null, 2) + "\n");
  fs.renameSync(f + ".tmp", f);
}

// ── Recording ───────────────────────────────────────────────────────────────
// Bodies → normalized observations → one batch through bin/gotcha.js. A body
// that does not validate is COUNTED and named, never recorded half-way.
function record(deps, claudeDir, bodies, now) {
  const store = G.makeStore(claudeDir, deps);
  const led = store.load();
  const ok = [];
  const rejected = [];
  for (const b of bodies) {
    const n = G.normalizeObservation(b, now);
    if (n.err) rejected.push({ ref: b && b.ref ? String(b.ref) : null, field: n.field, err: n.err });
    else ok.push(n.o);
  }
  const r = G.recordObservations(store, led, ok, now, { skipUnchanged: true });
  return { parsed: bodies.length, recorded: r.recorded.length, unchanged: r.unchanged, rejected, promoted: r.changes.promoted, bumped: r.changes.bumped, file: store.obsFile };
}
// Q4: the list grouped by RULE — fix one rule's issues together.
function groupByRule(views) {
  const by = new Map();
  for (const v of views) {
    const k = v.rule;
    if (!by.has(k)) by.set(k, { rule: k, name: v.name || null, count: 0, outcomes: {}, files: [], items: [] });
    const g = by.get(k);
    g.count++;
    g.outcomes[v.outcome] = (g.outcomes[v.outcome] || 0) + 1;
    if (v.path && !g.files.includes(v.path)) g.files.push(v.path);
    g.items.push(v);
  }
  return [...by.values()].sort((a, b) => (b.outcomes.open || 0) - (a.outcomes.open || 0) || b.count - a.count || a.rule.localeCompare(b.rule));
}

// ── The CLI ─────────────────────────────────────────────────────────────────
function ctxOf(deps) {
  const { args } = deps;
  const asJson = deps.wantsJson();
  const claudeDir = deps.resolveClaudeDir();
  const repoRoot = deps.repoRootOf(claudeDir);
  const valueOf = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const v = args[i + 1];
    return v !== undefined && !v.startsWith("--") ? v : "";
  };
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.has(args[i])) {
      i++;
      continue;
    }
    if (!args[i].startsWith("-")) pos.push(args[i]);
  }
  const out = (obj, code, human) => {
    if (asJson) deps.emitJson(obj, code);
    if (human) human();
    process.exit(code);
  };
  const fail = (code, reason, message, extra) => out(Object.assign({ ok: false, reason }, extra || {}, { message }), code, () => console.error(message));
  const cfg = () => (deps.readOverride ? deps.readOverride(claudeDir).map : {}) || {};
  return { args, asJson, claudeDir, repoRoot, valueOf, pos, out, fail, cfg };
}
const humanRecord = (label, r) => () => {
  console.log(`✓ ${label}: ${r.parsed} parsed · ${r.recorded} recorded · ${r.unchanged} unchanged${r.rejected.length ? ` · ${r.rejected.length} rejected` : ""}`);
  for (const p of r.promoted) console.log(`  promoted ${p.candidate} → ${p.id}: ${p.why}`);
  for (const x of r.rejected) console.log(`  rejected ${x.ref || "(no ref)"}: \`${x.field}\` ${x.err}`);
};
const humanGroups = (groups) => {
  for (const g of groups) {
    console.log(`  ${g.rule}${g.name ? ` (${g.name})` : ""} · ${g.count} · ${Object.entries(g.outcomes).map(([k, v]) => `${v} ${k}`).join(", ")}`);
    for (const it of g.items.slice(0, 5)) console.log(`      ${it.path || "-"}${it.line ? ":" + it.line : ""} ${it.message}`);
    if (g.items.length > 5) console.log(`      … +${g.items.length - 5} more`);
  }
};

async function importCmd(deps) {
  const c = ctxOf(deps);
  const kind = c.pos[2];
  const now = Date.now();
  if (kind === "sarif") {
    const file = c.pos[3];
    if (!file) return c.fail(2, "usage", "gotcha import sarif: name the SARIF file (orc gotcha import sarif <file>)");
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.resolve(file), "utf8").replace(/^﻿/, ""));
    } catch (e) {
      return c.fail(2, "not-sarif", `gotcha import sarif: ${file} is not readable JSON (${e.message.split("\n")[0]})`);
    }
    const state = readState(c.claudeDir);
    const p = parseSarif(doc, state.sarif);
    if (p.err) return c.fail(2, "not-sarif", `gotcha import sarif: ${file} is ${p.err}`);
    const r = record(deps, c.claudeDir, p.items.map((x) => x.body), now);
    state.sarif = Object.assign({}, state.sarif, p.state);
    writeState(c.claudeDir, state);
    const groups = groupByRule(p.items.map((x) => x.view));
    return c.out(Object.assign({ ok: true, source: "sarif", file: posix(file), tools: Object.keys(p.state), groups }, r), 0, () => {
      humanRecord("sarif", r)();
      humanGroups(groups);
    });
  }
  if (kind === "sonar") {
    const opts = { url: c.valueOf("--url") || c.cfg().sonar_url, project: c.valueOf("--project") || c.cfg().sonar_project, org: c.valueOf("--org") || c.cfg().sonar_org, pr: c.valueOf("--pr") || null, branch: c.valueOf("--branch") || null };
    const saved = c.valueOf("--file");
    let pages;
    if (saved) {
      try {
        pages = parseJsonStream(fs.readFileSync(path.resolve(saved), "utf8"));
      } catch (e) {
        return c.fail(2, "not-sonar", `gotcha import sonar: ${saved} is not readable JSON (${e.message.split("\n")[0]})`);
      }
    } else {
      if (!opts.url || !opts.project) return c.fail(2, "usage", "gotcha import sonar: needs --url and --project (or the `sonar_url` / `sonar_project` config keys), or --file <saved answer>");
      if (!process.env.SONAR_TOKEN) return c.fail(5, "auth", "gotcha import sonar: set SONAR_TOKEN in the environment (the token is never a config key)");
      const f = await fetchSonar(opts, Date.now() + 120000);
      if (!f.ok) return c.fail(f.code, f.reason, `gotcha import sonar: ${f.message}`);
      pages = f.pages;
    }
    const p = parseSonar(pages, opts);
    if (p.err) return c.fail(2, "not-sonar", `gotcha import sonar: ${saved || "the answer"} is ${p.err}`);
    const r = record(deps, c.claudeDir, p.items.map((x) => x.body), now);
    const groups = groupByRule(p.items.map((x) => x.view));
    return c.out(Object.assign({ ok: true, source: "sonar", offline: !!saved, project: opts.project || null, pr: opts.pr, branch: opts.branch, groups }, r), 0, () => {
      humanRecord("sonar", r)();
      humanGroups(groups);
    });
  }
  if (kind === "pr") {
    const n = Number(c.pos[3]);
    if (!Number.isInteger(n) || n <= 0) return c.fail(2, "usage", "gotcha import pr: name the PR number (orc gotcha import pr <n>)");
    const t = fetchThreads(n, c.repoRoot);
    if (!t.ok) return c.fail(t.code, t.reason, `gotcha import pr: ${t.message}`);
    const bodies = threadObservations(t.pr, t.rows);
    const r = record(deps, c.claudeDir, bodies, now);
    const bots = t.rows.filter((x) => x.author_kind === "bot").length;
    return c.out(Object.assign({ ok: true, source: "pr", pr: t.pr.number, state: t.pr.state, threads: t.rows.length, bots_skipped: bots }, r), 0, humanRecord(`PR ${n} (${t.rows.length} threads, ${bots} by bots skipped)`, r));
  }
  if (kind === "issues") {
    const label = c.valueOf("--label") || "bug";
    const res = importIssues(c.repoRoot, label, null, null);
    if (!res.ok) return c.fail(res.code, res.reason, `gotcha import issues: ${res.message}`);
    const r = record(deps, c.claudeDir, res.bodies, now);
    return c.out(Object.assign({ ok: true, source: "defect", label, issues: res.issues }, r), 0, humanRecord(`issues labelled ${label} (${res.issues} closed)`, r));
  }
  return c.fail(2, "usage", "Usage: orc gotcha import sarif <file> | sonar [--url U --project K] [--pr N|--branch B] [--org O] [--file <saved answer>] | pr <n> | issues [--label bug]");
}
function importIssues(cwd, label, since, deadline) {
  const a = ["issue", "list", "--state", "closed", "--label", label, "--json", "number,title,labels,stateReason,closedByPullRequestsReferences,closedAt", "--limit", "100"];
  if (since) a.push("--search", `closed:>=${String(since).slice(0, 10)}`);
  const r = ghJson(a, cwd, deadline);
  if (!r.ok) return r;
  const issues = flatPages(r.pages);
  const files = {};
  const filesOf = (n) => {
    if (files[n]) return files[n];
    const f = ghJson(["pr", "view", String(n), "--json", "files"], cwd, deadline);
    files[n] = f.ok ? flatPages(f.pages).flatMap((x) => (x && x.files ? x.files.map((y) => y.path) : [])) : [];
    return files[n];
  };
  const bodies = issueObservations(issues, filesOf);
  const newest = issues.map((i) => i.closedAt).filter(Boolean).sort().pop() || null;
  return { ok: true, bodies, issues: issues.length, cursor: newest };
}

// ── CI: failing runs, their failing steps, flaky named ──────────────────────
const RUN_FIELDS = "databaseId,headSha,headBranch,workflowName,conclusion,status,attempt,createdAt,url,event";
function ciRuns(cwd, o, deadline) {
  if (o.run) {
    const v = ghJson(["run", "view", String(o.run), "--json", RUN_FIELDS], cwd, deadline);
    if (!v.ok) return v;
    const runs = flatPages(v.pages);
    // The other runs of the SAME sha decide flaky; a failed list is not fatal.
    const sib = runs[0] && runs[0].headSha ? ghJson(["run", "list", "--commit", runs[0].headSha, "--json", RUN_FIELDS, "--limit", "50"], cwd, deadline) : null;
    const all = runs.concat(sib && sib.ok ? flatPages(sib.pages).filter((x) => x && x.databaseId && x.databaseId !== runs[0].databaseId) : []);
    return { ok: true, runs, all, branch: null };
  }
  let branch = o.branch || null;
  if (o.pr) {
    const p = ghJson(["pr", "view", String(o.pr), "--json", "headRefName"], cwd, deadline);
    if (!p.ok) return p;
    branch = (flatPages(p.pages)[0] || {}).headRefName || null;
  }
  const a = ["run", "list", "--json", RUN_FIELDS, "--limit", "50"];
  if (branch) a.push("--branch", branch);
  if (o.since) a.push("--created", `>=${String(o.since).slice(0, 10)}`);
  const l = ghJson(a, cwd, deadline);
  if (!l.ok) return l;
  const all = flatPages(l.pages).filter((x) => x && x.databaseId);
  // The newest run per workflow decides whether that workflow is red now.
  const newest = new Map();
  for (const r of all.slice().sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))) if (!newest.has(r.workflowName)) newest.set(r.workflowName, r);
  const runs = [...newest.values()].filter((r) => String(r.conclusion).toLowerCase() === "failure");
  return { ok: true, runs, all, branch };
}
function ciDetail(run, all, cwd, deadline, attempt) {
  const a = ["run", "view", String(run.databaseId), "--log-failed"];
  if (attempt) a.push("--attempt", String(attempt));
  const log = ghRun(a, cwd, deadline);
  if (!log.ok) return log;
  const failures = parseCiLog(log.out);
  const green = all.find((x) => x.headSha === run.headSha && x.workflowName === run.workflowName && String(x.conclusion).toLowerCase() === "success");
  const runFlaky = !!(green || (attempt && String(run.conclusion).toLowerCase() === "success"));
  return {
    ok: true,
    row: {
      id: run.databaseId,
      workflow: run.workflowName || null,
      sha: run.headSha || null,
      branch: run.headBranch || null,
      attempt: run.attempt || 1,
      url: run.url || null,
      flaky: runFlaky,
      flaky_reason: runFlaky ? "the same sha passed on another attempt" : null,
      failures,
    },
  };
}
// `orc ci flaky` — exit 0 flaky (no repair round) · 1 red (repair as usual) ·
// 3 unknown (no test named: red) · 2 usage. It reads two saved logs; it runs nothing.
function ciFlakyCmd(c) {
  const first = c.valueOf("--first");
  const rerun = c.valueOf("--rerun");
  const exitV = c.valueOf("--rerun-exit");
  const usage = "Usage: orc ci flaky --first <log> [--rerun <log>] [--rerun-exit <n>] [--json]   exit 0 flaky · 1 red · 3 unknown";
  if (!first) return c.fail(2, "usage", usage);
  const read = (f) => {
    try {
      return fs.readFileSync(path.resolve(f), "utf8");
    } catch (_) {
      return null;
    }
  };
  const a = read(first);
  if (a == null) return c.fail(2, "unreadable", `ci flaky: cannot read ${first}`);
  const b = rerun ? read(rerun) : null;
  if (rerun && b == null) return c.fail(2, "unreadable", `ci flaky: cannot read ${rerun}`);
  const r = classifyRerun(a, b, exitV === undefined || exitV === "" ? null : exitV);
  const gate_line = r.state === "flaky" ? `GATE flaky :: ${r.flaky.join(", ")}` : null;
  const payload = Object.assign({ ok: true, rerun_read: rerun ? true : false, rerun_exit: exitV ? Number(exitV) : null }, r, { repair_round: r.state !== "flaky", gate_line });
  return c.out(payload, r.state === "flaky" ? 0 : r.state === "red" ? 1 : 3, () => {
    console.log(`ci flaky: ${r.state.toUpperCase()} — ${r.reason}`);
    for (const t of r.flaky) console.log(`  flaky:  ${t}`);
    for (const t of r.still_failing) console.log(`  failed: ${t}`);
    for (const t of r.missing) console.log(`  not re-run: ${t}`);
    if (gate_line) console.log(`  ${gate_line}   (no repair round; the run is not red)`);
  });
}

function ciFailedCmd(deps) {
  const c = ctxOf(deps);
  if (c.pos[1] === "flaky") return ciFlakyCmd(c);
  if (c.pos[1] !== "failed") return c.fail(2, "usage", "Usage: orc ci failed [--pr <n> | --run <id>] [--json]   the failing CI steps (read-only; exit 0 failures · 1 none · 5 gh missing/not authed)\n       orc ci flaky --first <log> [--rerun <log>] [--rerun-exit <n>] [--json]   a local red run: flaky or real");
  const o = { pr: c.valueOf("--pr") || null, run: c.valueOf("--run") || null };
  if (!o.pr && !o.run) o.branch = currentBranch(c.repoRoot);
  const l = ciRuns(c.repoRoot, o, null);
  if (!l.ok) return c.fail(l.code, l.reason, `ci failed: ${l.message}`);
  const rows = [];
  for (const run of l.runs) {
    const d = ciDetail(run, l.all, c.repoRoot, null, null);
    if (!d.ok) return c.fail(d.code, d.reason, `ci failed: ${d.message}`);
    rows.push(d.row);
  }
  const real = rows.reduce((n, r) => n + (r.flaky ? 0 : r.failures.filter((f) => !f.flaky).length), 0);
  const flaky = rows.reduce((n, r) => n + (r.flaky ? r.failures.length : r.failures.filter((f) => f.flaky).length), 0);
  const payload = { ok: true, pr: o.pr ? Number(o.pr) : null, run: o.run ? Number(o.run) : null, branch: l.branch || o.branch || null, runs: rows, counts: { runs: rows.length, failures: real, flaky } };
  return c.out(payload, real ? 0 : 1, () => {
    if (!rows.length) return console.log(`ci: no failing run${payload.branch ? ` on ${payload.branch}` : ""}`);
    for (const r of rows) {
      console.log(`run ${r.id} · ${r.workflow} · ${String(r.sha || "").slice(0, 7)}${r.flaky ? " · FLAKY (" + r.flaky_reason + ")" : ""}`);
      for (const f of r.failures) {
        console.log(`  [${f.job}] ${f.step}${f.flaky ? " · flaky — not a failure" : ""} · ${f.rule} · repro: ${f.repro}${f.repro_reason ? ` (${f.repro_reason})` : ""}`);
        for (const t of f.tests_failed) console.log(`      failed: ${t}`);
        for (const t of f.tests_flaky) console.log(`      flaky:  ${t} (failed, then passed on a re-attempt)`);
        for (const x of f.lines) console.log(`      ${x}`);
      }
    }
    console.log(`${real} failure(s) · ${flaky} flaky — a flaky failure gets no repair round`);
  });
}
// CI → observations for sync: still red → open · a later green run of the same
// workflow on another sha → addressed · green on the SAME sha → flaky (never a gotcha).
function ciObservations(cwd, branch, since, deadline) {
  const l = ciRuns(cwd, { branch, since }, deadline);
  if (!l.ok) return l;
  const bodies = [];
  const sorted = l.all.slice().sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
  for (const run of sorted) {
    const concl = String(run.conclusion).toLowerCase();
    const reattempted = concl === "success" && Number(run.attempt) > 1;
    if (concl !== "failure" && !reattempted) continue;
    const d = ciDetail(run, l.all, cwd, deadline, reattempted ? 1 : null);
    if (!d.ok) return d;
    const laterGreen = sorted.find((x) => x.workflowName === run.workflowName && x.headSha !== run.headSha && String(x.createdAt) > String(run.createdAt) && String(x.conclusion).toLowerCase() === "success");
    for (const f of d.row.failures) {
      const outcome = d.row.flaky || f.flaky ? "flaky" : laterGreen ? "addressed" : "open";
      bodies.push({ source: "ci", ref: `CI ${run.workflowName} · ${f.signature} · ${String(run.headSha || "").slice(0, 12)}`, rule: f.rule, sig: f.tests_failed[0] || f.lines[0] || f.step, path: f.path, lines: f.line ? [f.line] : null, commit: run.headSha || null, at: run.createdAt || null, outcome, author: "bot" });
    }
  }
  const newest = l.all.map((x) => x.createdAt).filter(Boolean).sort().pop() || null;
  return { ok: true, bodies, cursor: newest };
}

// ── orc pr threads <n> (Q1) ─────────────────────────────────────────────────
function prThreadsCmd(deps) {
  const c = ctxOf(deps);
  const n = Number(c.pos[2]);
  if (!Number.isInteger(n) || n <= 0) return c.fail(2, "usage", "Usage: orc pr threads <n> [--all] [--json]   the unresolved review threads (read-only; exit 0 threads · 1 none open · 5 gh missing/not authed)");
  const all = c.args.includes("--all");
  const t = fetchThreads(n, c.repoRoot);
  if (!t.ok) return c.fail(t.code, t.reason, `pr threads: ${t.message}`);
  const rv = fetchReviews(n, c.repoRoot);
  const open = t.rows.filter((r) => !r.resolved && !r.outdated);
  const threads = all ? t.rows.filter((r) => r.author_kind === "human") : open.filter((r) => r.author_kind === "human");
  const bots = (all ? t.rows : open).filter((r) => r.author_kind === "bot");
  const payload = {
    ok: true,
    pr: t.pr.number,
    title: t.pr.title,
    state: t.pr.state,
    url: t.pr.url,
    head: t.pr.head,
    all,
    threads,
    bots,
    reviews: rv.ok ? rv.reviews : [],
    reviews_error: rv.ok ? null : rv.message,
    counts: {
      threads: t.rows.length,
      open: open.filter((r) => r.author_kind === "human").length,
      resolved: t.rows.filter((r) => r.resolved).length,
      outdated: t.rows.filter((r) => r.outdated).length,
      bots: t.rows.filter((r) => r.author_kind === "bot").length,
    },
  };
  const shown = threads.length + (all ? bots.length : 0);
  return c.out(payload, payload.counts.open || (all && shown) ? 0 : 1, () => {
    console.log(`PR #${t.pr.number} — "${t.pr.title || ""}" · branch ${t.pr.head || "-"} · ${t.pr.state || "-"}`);
    console.log(`${payload.counts.open} unresolved thread(s) by people (${payload.counts.threads} total · ${payload.counts.resolved} resolved · ${payload.counts.outdated} outdated · ${payload.counts.bots} by bots)`);
    const line = (r) => `  [${r.n}] ${r.author_kind === "bot" ? "bot " : "@"}${r.author || "?"} · ${r.path || "-"}${r.line || r.original_line ? ":" + (r.line || r.original_line) : ""}${all ? " · " + r.state : ""}\n      (untrusted) "${r.first.text}"\n      ${r.url || ""}`;
    for (const r of threads) console.log(line(r));
    if (bots.length) {
      console.log("bot threads (listed apart, never mixed):");
      for (const r of bots) console.log(line(r));
    }
    for (const r of payload.reviews) console.log(`  review CHANGES_REQUESTED · @${r.author || "?"}: (untrusted) "${r.body.text}"`);
  });
}

// ── orc gotcha sync (`05` §7.1) ─────────────────────────────────────────────
async function syncCmd(deps) {
  const c = ctxOf(deps);
  const now = Date.now();
  const hours = Math.max(1, Number(c.cfg().gotcha_sync_hours) || 6);
  const state = readState(c.claudeDir);
  const last = Date.parse(state.last_sync || "");
  const nextDue = Number.isFinite(last) ? new Date(last + hours * 3600e3).toISOString() : null;
  if (Number.isFinite(last) && now < last + hours * 3600e3 && !c.args.includes("--force")) {
    const ago = Math.round((now - last) / 3600e3 * 10) / 10;
    return c.out({ ok: true, due: false, ran: false, last_sync: state.last_sync, next_due: nextDue, every_hours: hours, sources: [], new: 0, promoted: [], state_file: statePath(c.claudeDir) }, 1, () =>
      console.log(`gotchas: sync — not due (last ${ago} h ago, every ${hours} h)`)
    );
  }
  const cfg = c.cfg();
  const sources = [];
  const bodies = [];
  const cursors = Object.assign({}, state.sources);
  const runSource = async (name, why, fn) => {
    const row = { name, ran: false, ok: null, skipped: why || null, error: null, timed_out: false, observations: 0 };
    sources.push(row);
    if (why) return;
    row.ran = true;
    const deadline = Date.now() + SYNC_BOX_MS;
    let r;
    try {
      r = await fn(deadline, (cursors[name] || {}).cursor || null);
    } catch (e) {
      r = { ok: false, message: e.message };
    }
    if (!r.ok) {
      row.ok = false;
      row.timed_out = !!r.timedOut;
      row.error = r.timedOut ? `${name} timed out` : r.message;
      cursors[name] = Object.assign({}, cursors[name], { last_error: row.error, last_run: new Date(now).toISOString() });
      return;
    }
    row.ok = true;
    row.observations = r.bodies.length;
    bodies.push(...r.bodies);
    cursors[name] = { cursor: r.cursor || (cursors[name] || {}).cursor || null, last_ok: new Date(now).toISOString(), last_error: null };
  };
  // Sonar — needs sonar_url + sonar_project AND SONAR_TOKEN in the environment.
  const sonarWhy = !cfg.sonar_url || !cfg.sonar_project ? "sonar_url / sonar_project not set" : !process.env.SONAR_TOKEN ? "SONAR_TOKEN not in the environment" : null;
  // gh — one auth probe decides the three gh sources.
  const auth = ghRun(["auth", "status"], c.repoRoot, Date.now() + SYNC_BOX_MS);
  // Missing or not logged in is a SKIP (the source is not available). A probe
  // that timed out or broke is a FAILURE of every gh source, named.
  const ghWhy = auth.ok ? null : auth.reason === "gh-missing" ? "gh is not installed" : auth.reason === "gh-not-authed" ? "gh is not logged in" : null;
  const ghBroken = auth.ok || ghWhy ? null : auth;
  let pr = null;
  if (!ghWhy && !ghBroken) {
    const p = ghJson(["pr", "view", "--json", "number,state,headRefName"], c.repoRoot, Date.now() + SYNC_BOX_MS);
    pr = p.ok ? flatPages(p.pages)[0] || null : null;
  }
  const branch = currentBranch(c.repoRoot);
  await runSource("sonar", sonarWhy, async (deadline, cursor) => {
    const f = await fetchSonar({ url: cfg.sonar_url, project: cfg.sonar_project, org: cfg.sonar_org, pr: pr && pr.number, branch: pr ? null : branch }, deadline);
    if (!f.ok) return f;
    const p = parseSonar(f.pages, { pr: pr && pr.number });
    if (p.err) return { ok: false, message: p.err };
    const fresh = p.items.filter((x) => !cursor || !x.updated || String(x.updated) > String(cursor));
    const newest = p.items.map((x) => x.updated).filter(Boolean).sort().pop() || cursor;
    return { ok: true, bodies: fresh.map((x) => x.body), cursor: newest };
  });
  await runSource("pr", ghWhy || (!pr && !ghBroken ? "no PR for this branch" : null), async (deadline) => {
    if (ghBroken) return ghBroken;
    const t = fetchThreads(pr.number, c.repoRoot, deadline);
    if (!t.ok) return t;
    return { ok: true, bodies: threadObservations(t.pr, t.rows), cursor: `PR ${pr.number}` };
  });
  await runSource("defects", ghWhy, async (deadline, cursor) => {
    if (ghBroken) return ghBroken;
    const r = importIssues(c.repoRoot, "bug", cursor, deadline);
    if (!r.ok) return r;
    return { ok: true, bodies: r.bodies, cursor: r.cursor || cursor };
  });
  await runSource("ci", ghWhy, async (deadline, cursor) => ghBroken || ciObservations(c.repoRoot, pr ? pr.headRefName : branch, cursor, deadline));
  const r = record(deps, c.claudeDir, bodies, now);
  state.last_sync = new Date(now).toISOString();
  state.sources = cursors;
  writeState(c.claudeDir, state);
  const failed = sources.filter((s) => s.ran && !s.ok);
  const okN = sources.filter((s) => s.ran && s.ok).length;
  const code = failed.length ? 6 : r.recorded ? 0 : 1;
  const bits = [`${r.recorded} new observation${r.recorded === 1 ? "" : "s"}`, `${okN} source${okN === 1 ? "" : "s"} ok`]
    .concat(failed.map((s) => (s.timed_out ? `${s.name} timed out` : `${s.name} failed (${s.error})`)))
    .concat(sources.filter((s) => s.skipped).map((s) => `${s.name} skipped (${s.skipped})`));
  const payload = Object.assign({ ok: failed.length === 0, due: true, ran: true, last_sync: state.last_sync, next_due: new Date(now + hours * 3600e3).toISOString(), every_hours: hours, sources, new: r.recorded, failed: failed.map((s) => s.name), state_file: statePath(c.claudeDir) }, r);
  return c.out(payload, code, () => console.log(`gotchas: sync — ${bits.join(" · ")}`));
}

module.exports = {
  parseJsonStream,
  parseSarif,
  parseSonar,
  parseThreads,
  threadOutcome,
  threadObservations,
  issueObservations,
  parseCiLog,
  ciSignature,
  classifyRerun,
  groupByRule,
  THREADS_QUERY,
  importCmd,
  syncCmd,
  prThreadsCmd,
  ciFailedCmd,
};
