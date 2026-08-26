"use strict";
/**
 * mockrun-catalog.js — the catalogue of MOCKED RUNS that ship with ORC.
 *
 * A mocked run is a written walkthrough of ONE lane: what you type, what ORC
 * prints back, what lands on disk. Nothing was executed to produce them — they
 * are documentation — and that is exactly why they exist: a new user needs to
 * know what a lane LOOKS like before paying tokens to find out.
 *
 * Two sources, one catalogue:
 *   · `mock-run/*.md`                       the reader-facing walkthroughs
 *   · `templates/skills/<skill>/examples/*`  the dense annotated examples that
 *                                            already shipped with each skill
 *
 * DERIVED, never hand-listed. A new file in either place appears by itself:
 * the title comes from the file's own `# ` heading, the lane from whether
 * `templates/commands/<name>.md` exists, and the one-line summary from the
 * `> ` blockquote the walkthroughs open with. The only hand-written table here
 * is the READING ORDER (`GROUPS` + `GROUP_OF`) — an order is editorial and
 * cannot be derived from a filename. A file nobody placed still shows up, in
 * the `other` group, because a mocked run that exists and is invisible is the
 * failure mode this module is meant to make impossible.
 *
 * This is package content, not project state: it is the same on every machine
 * and needs no `.claude/`. `orc mock-run` reads it, and `orc ui` serves it the
 * same way it serves the onboarding walkthrough — straight from the module,
 * because spawning a subprocess to read files that ship in this package would
 * be ceremony with a cost. It is NOT `orc mock`, which lists the runnable
 * `mock-examples/<slug>/` folders a green verify left in YOUR project.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const WALKTHROUGH_DIR = path.join(ROOT, "mock-run");
const SKILLS_DIR = path.join(ROOT, "templates", "skills");
const COMMANDS_DIR = path.join(ROOT, "templates", "commands");

// The reading order. Group titles are DATA (the panel prints them as written
// and never translates them, exactly like a config key or a doctor message).
const GROUPS = [
  { id: "start", title: "Start here" },
  { id: "build", title: "Build a change" },
  { id: "decide", title: "Decide what to build" },
  { id: "knowledge", title: "Teach ORC your project" },
  { id: "check", title: "Check what happened" },
  { id: "ship", title: "Ship and hand over" },
  { id: "tools", title: "Panel and terminal" },
  { id: "other", title: "More" },
];

// slug (or lane name) → group. Anything absent lands in `other`.
const GROUP_OF = {
  "the-example-project": "start",
  "a-normal-day": "start",

  orc: "build",
  "orc-ultra": "build",
  "orc-mini": "build",
  "orc-fast": "build",
  "orc-quick": "build",
  "orc-diy": "build",

  // v0.48.0. It sits with the deciding lanes rather than the knowledge ones: a
  // /orc-doc document is derived from what you DECIDED, not from the code —
  // which is exactly what separates it from /orc-wiki and /orc-learn.
  "orc-doc": "decide",

  "orc-brainstorm": "decide",
  "orc-grill": "decide",
  "orc-plan": "decide",
  "orc-route": "decide",
  "orc-explain": "decide",
  "orc-analyze": "decide",
  "orc-analyze-mini": "decide",
  "context-combiner": "decide",
  "orc-poly": "decide",

  // v0.50.0. It sits with the TOOLS rather than the build lanes: `orc extra` is
  // not a lane you invoke — it is a setting that changes where the lanes you
  // already run send their work.
  "orc-extra": "tools",
  // v0.54.0. It sits beside `orc-extra` for the same reason: recovering a
  // half-finished foreign dispatch is a thing you do at the terminal and in the
  // panel, not a lane you invoke.
  "extra-recovery": "tools",
  // v0.55.0. Same shelf again: the four lanes that pin an agent instead of
  // scoring a task are a routing decision, and routing is where `orc-extra`
  // already lives.
  "extra-slots": "tools",

  "orc-wiki": "knowledge",
  "orc-pattern": "knowledge",
  "orc-learn": "knowledge",
  "orc-claude": "knowledge",
  "orc-export": "knowledge",

  "orc-verify": "check",
  "orc-challenge": "check",
  // v0.49.1. It sits beside the lane it belongs to, and it is a SEPARATE
  // walkthrough because the council is a decision the reader takes before the
  // first review runs — not a detail of one.
  "orc-challenge-council": "check",
  "orc-pact": "check",
  "orc-boundary": "check",
  "orc-aftermath": "check",
  "orc-budget": "check",
  "orc-retro": "check",

  "orc-pr-setup": "ship",
  "orc-pr-driver": "ship",
  "orc-handoff": "ship",

  "orc-ui": "tools",
  "orc-cli": "tools",
};

// A few docs lead their group because they are prerequisites for reading the
// rest, which alphabetical order cannot know. Everything else sorts by title.
const PINNED_FIRST = ["the-example-project", "orc", "orc-brainstorm", "orc-wiki-example", "orc-verify-example"];

// Files in mock-run/ that are not themselves a mocked run.
const NOT_A_DOC = new Set(["INDEX.md", "README.md"]);

function readSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch (_) {
    return null;
  }
}

function listSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return [];
  }
}

// `# Mock run — \`/orc-pact\`` → `Mock run — /orc-pact`. Backticks are markup
// for a reader, not part of the title.
function titleOf(md, fallback) {
  const m = String(md || "").match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].replace(/`/g, "").trim() : fallback;
}

// The walkthroughs open with a `> one line` blockquote under the title. The
// older annotated examples do not, so the first real line stands in.
function summaryOf(md) {
  const lines = String(md || "").split(/\r?\n/);
  let seenTitle = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("# ")) {
      seenTitle = true;
      continue;
    }
    if (!seenTitle) continue;
    if (line.startsWith(">")) return clip(line.replace(/^>\s?/, ""));
    if (line.startsWith("#") || line.startsWith("---")) continue;
    return clip(line);
  }
  return "";
}

// A summary is read as one line of prose, so the markup that made it readable
// in the file (`**bold**`, `` `code` ``) is noise here.
function clip(s, max = 200) {
  const t = String(s).replace(/\*\*/g, "").replace(/`/g, "").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

// A name is a lane only when the payload really ships that slash command. This
// is what keeps `/orc-pact` a link and `a-normal-day` plain text, with no list
// to maintain in two places.
function laneOf(name) {
  return fs.existsSync(path.join(COMMANDS_DIR, name + ".md")) ? "/" + name : null;
}

function entry(slug, file, kind, name, md) {
  const stat = (() => {
    try {
      return fs.statSync(file);
    } catch (_) {
      return null;
    }
  })();
  const body = md === null ? "" : md;
  return {
    slug,
    title: titleOf(body, slug),
    lane: laneOf(name),
    kind, // "walkthrough" = written for a reader · "annotated" = the dense one
    group: GROUP_OF[name] || GROUP_OF[slug] || "other",
    summary: summaryOf(body),
    path: path.relative(ROOT, file).split(path.sep).join("/"),
    bytes: stat ? stat.size : body.length,
    lines: body ? body.split(/\r?\n/).length : 0,
  };
}

// Every mocked run that ships in this package, in reading order.
function list() {
  const out = [];

  for (const e of listSafe(WALKTHROUGH_DIR)) {
    if (!e.isFile() || !e.name.endsWith(".md") || NOT_A_DOC.has(e.name)) continue;
    const name = e.name.replace(/\.md$/, "");
    const file = path.join(WALKTHROUGH_DIR, e.name);
    out.push(entry(name, file, "walkthrough", name, readSafe(file)));
  }

  for (const s of listSafe(SKILLS_DIR)) {
    if (!s.isDirectory()) continue;
    const exDir = path.join(SKILLS_DIR, s.name, "examples");
    for (const f of listSafe(exDir)) {
      if (!f.isFile() || !f.name.endsWith(".md")) continue;
      const file = path.join(exDir, f.name);
      // One example per skill is the shipped shape; a second one keeps its own
      // file name so neither can hide the other.
      const base = f.name.replace(/\.md$/, "");
      const slug = `${s.name}-example`;
      const taken = out.some((d) => d.slug === slug);
      out.push(entry(taken ? `${s.name}-${base}` : slug, file, "annotated", s.name, readSafe(file)));
    }
  }

  const rank = new Map(GROUPS.map((g, i) => [g.id, i]));
  out.sort((a, b) => {
    const g = (rank.get(a.group) ?? 99) - (rank.get(b.group) ?? 99);
    if (g) return g;
    // Inside a group: pinned docs first, then the reader-facing walkthrough
    // before the dense annotated example, then by title.
    const p = (d) => {
      const i = PINNED_FIRST.indexOf(d.slug);
      return i === -1 ? PINNED_FIRST.length : i;
    };
    const pin = p(a) - p(b);
    if (pin) return pin;
    if (a.kind !== b.kind) return a.kind === "walkthrough" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return out;
}

// The catalogue, grouped, with the counts a header can print without counting.
function catalogue() {
  const docs = list();
  const groups = GROUPS.map((g) => ({
    ...g,
    docs: docs.filter((d) => d.group === g.id),
  })).filter((g) => g.docs.length);
  return { root: path.relative(ROOT, WALKTHROUGH_DIR) || "mock-run", total: docs.length, groups, docs };
}

// One doc, with its body. Returns null when the slug is unknown — the caller
// decides what a miss means (exit 1 in the CLI, a 404 in the panel).
function get(slug) {
  const hit = list().find((d) => d.slug === slug);
  if (!hit) return null;
  return { ...hit, body: readSafe(path.join(ROOT, hit.path)) || "" };
}

module.exports = { GROUPS, catalogue, list, get };
