"use strict";
// ── orc graph audit (v1.9.1 A2) — WHY the map is thin ───────────────────────
//
// `orc graph status` can now say THIN. This says why, and it is the only
// answer in the family whose subject is the PARSER rather than the code.
//
// The question it exists for is a real one, measured on a real project: a graph
// with 1.9 symbols per file answers `exit 4` to most questions, and until now
// nothing told anyone whether the code has no named functions or the parser did
// not read them. Those are opposite problems with opposite fixes, and the only
// evidence that tells them apart is what the empty files actually LOOK like.
//
// THE RULES THIS FILE HOLDS
//
//   1. It READS. It never writes a file, never takes the lock, never runs the
//      extractor, and it costs zero model tokens.
//   2. A zero-symbol file is NOT a defect by itself. A component with no named
//      function is a file the parser read correctly. The last line says so, and
//      the shape reading is a HINT that never becomes a verdict.
//   3. It reads at most `SHAPE_LINES` lines of a file, and only of a file it is
//      about to name. A repository of ten thousand empty files is still one
//      bounded read per LISTED file.
//   4. It is a USER command. `LANE_CALLS["graph-audit"].lanes` is `[]` and a
//      test holds it there: nothing a lane does is made better by an audit.

const fs = require("fs");
const path = require("path");
const G = require("./graph.js");

// How far into a file the sampler looks for its first real declaration. A file
// with a 40-line licence header and then `export default {` is common; a file
// whose first declaration is below line 40 is rare enough to read as `other`.
const SHAPE_LINES = 40;
const TOP_DEFAULT = 20;
const TOP_CAP = 200;

// The languages whose empty files are worth sampling. Sampling a `.json`
// fixture would produce a shape nobody can act on.
const SAMPLED = new Set(["js", "ts", "vue", "svelte"]);

// Each shape, the plain reading that goes beside it, and whether that reading
// is a PARSER GAP — a file the parser should have indexed and did not. Only
// those three are worth an issue; the rest are files that really are data.
const SHAPES = [
  { id: "script-setup", test: /^<script\s+setup/, reading: "a component with no named function — the parser is right, there is nothing to name", gap: false },
  { id: "script", test: /^<script[\s>]/, reading: "a component whose script block declared nothing the parser names", gap: true },
  // graph@6 (W5b) names the members of a component, a mixin and a store
  // module, and the plain keys of a data object. An object that is STILL empty
  // has neither — quoted keys, or nothing at all.
  { id: "export-default-object", test: /^export default \{/, reading: "an object literal with no member the parser names (quoted keys, or empty) — data, not code", gap: false },
  { id: "export-default-component", test: /^export default (defineComponent|Vue\.extend)\s*\(/, reading: "a component defined as an object whose members the parser did not find — a parser gap; report it with one file path", gap: true },
  { id: "export-default-class", test: /^export default class\b/, reading: "a class the parser should index — report it with one file path", gap: true },
  { id: "export-const-fn", test: /^export const \w+\s*=\s*(\(|async\b)/, reading: "an arrow constant the parser SHOULD index — a parser gap; report it with one file path", gap: true },
  { id: "export-function", test: /^export (async )?function\b/, reading: "a function the parser should index — report it with one file path", gap: true },
  { id: "module-exports-object", test: /^module\.exports\s*=\s*\{/, reading: "data", gap: false },
  { id: "class", test: /^class \w+/, reading: "a class the parser should index — report it with one file path", gap: true },
  { id: "function", test: /^(async )?function \w+/, reading: "a function the parser should index — report it with one file path", gap: true },
];
const OTHER = { id: "other", reading: "no declaration in the first lines — data, a type file, or a re-export", gap: false };

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (_) {
    return null;
  }
};

// The first line of a file that is not blank, not a comment and not an import.
// The import skip matters: a Vue SFC opens with twenty imports and its shape is
// whatever follows them.
function firstDeclaration(abs) {
  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch (_) {
    return null;
  }
  const lines = text.split(/\r?\n/).slice(0, SHAPE_LINES);
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlock = true;
      continue;
    }
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("<!--")) continue;
    // A directive prologue is not a declaration, and neither is an import. Skip
    // both, or every CommonJS file in the repository reads as `other`.
    if (/^["']use (strict|client|server)["'];?$/.test(line)) continue;
    if (/^(import|export \{|export \*|const .* = require\()/.test(line)) continue;
    return line;
  }
  return null;
}

function shapeOf(abs) {
  const line = firstDeclaration(abs);
  if (line == null) return OTHER;
  for (const s of SHAPES) if (s.test.test(line)) return s;
  return OTHER;
}

function audit(claudeDir, root, opts) {
  const o = opts || {};
  const p = G.graphPaths(claudeDir);
  const index = readJson(p.index);
  const files = readJson(p.files);
  const meta = readJson(p.meta);
  if (!index || !files || !meta) return { ok: false, state: "none", reason: "no-index", exit: 1 };

  const SIG = require("./graph-signals.js");
  const density = meta.density || G.densityOf(index, files);
  const thin = SIG.isThin(density, meta.files || Object.keys(index.by_file || {}).length);
  const top = Math.max(1, Math.min(TOP_CAP, Number(o.top) || TOP_DEFAULT));

  // Per language: the density field, plus which extractor actually read each
  // file. A language read by the heuristic where a real parser was expected is
  // half the answer on its own.
  const byLang = {};
  for (const [lang, v] of Object.entries(density.by_lang || {})) byLang[lang] = { ...v, per_file: v.files ? Math.round((10 * v.symbols) / v.files) / 10 : 0, extractor: {} };
  for (const [rel, v] of Object.entries(files)) {
    const lang = (index.by_file[rel] && index.by_file[rel].lang) || G.LANG_BY_EXT[path.extname(rel).toLowerCase()] || "other";
    const row = byLang[lang];
    if (!row || !v || !v.extractor) continue;
    row.extractor[v.extractor] = (row.extractor[v.extractor] || 0) + 1;
  }

  // The empty files, longest first: the longest file the parser read as empty
  // is the one that says most about what it cannot read.
  const zero = [];
  const partial = [];
  for (const [rel, v] of Object.entries(index.by_file)) {
    const n = (v.symbols || []).filter((s) => s.kind !== "module").length;
    if (v.coverage === "partial") partial.push({ path: rel, ranges: v.partial || [] });
    if (n > 0) continue;
    zero.push({ path: rel, lines: Number(v.lines) || 0, lang: v.lang || G.LANG_BY_EXT[path.extname(rel).toLowerCase()] || "other" });
  }
  zero.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));

  // The sampler reads only the files it lists, and only the languages whose
  // shape means anything.
  const shapeCount = new Map();
  for (const row of zero) {
    if (!SAMPLED.has(row.lang)) continue;
    const s = shapeOf(path.join(root, ...row.path.split("/")));
    row.shape = s.id;
    shapeCount.set(s.id, (shapeCount.get(s.id) || 0) + 1);
  }
  const shapes = [...shapeCount.entries()]
    .map(([id, count]) => {
      const def = SHAPES.find((x) => x.id === id) || OTHER;
      return { shape: id, count, reading: def.reading, gap: def.gap };
    })
    .sort((a, b) => b.count - a.count || a.shape.localeCompare(b.shape));

  const skipped = Object.entries(files)
    .filter(([, v]) => v && v.skipped)
    .map(([rel, v]) => ({ path: rel, reason: v.skipped, bytes: Number(v.bytes) || 0 }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const gen = meta.generation || 0;
  const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const pad = (v, w) => String(v).padStart(w);
  const head =
    `graph audit (gen ${gen}) — ${num(meta.files || 0)} files · ${num(meta.symbols || 0)} symbols · ` +
    `${density.symbols_per_file} symbols/file${thin ? " · THIN" : ""}`;
  const table = [
    "  lang   files  symbols  per-file  zero   partial  skipped  extractor",
    ...Object.entries(byLang)
      .sort((a, b) => b[1].files - a[1].files || a[0].localeCompare(b[0]))
      .map(([lang, v]) => {
        const ex = Object.entries(v.extractor)
          .sort((a, b) => b[1] - a[1])
          .map(([k, c]) => `${k} (${c})`)
          .join(" · ");
        return `  ${lang.padEnd(6)} ${pad(num(v.files), 5)} ${pad(num(v.symbols), 8)} ${pad(v.per_file, 9)} ${pad(num(v.zero), 5)} ${pad(num(v.partial), 9)} ${pad(num(v.skipped), 8)}  ${ex}`;
      }),
  ];
  const zeroList = zero.length
    ? [
        `  files the parser read as EMPTY, longest first (${Math.min(top, zero.length)} of ${num(zero.length)}${zero.length > top ? " · --top=N for more" : ""})`,
        ...zero.slice(0, top).map((z) => `  ${pad(num(z.lines), 6)}  ${z.path}${z.shape ? `  ${z.shape}` : ""}`),
      ]
    : ["  no file was read as empty"];
  const shapeList = shapes.length
    ? [
        `  what the first declaration in an empty file looks like (${num(zero.filter((z) => SAMPLED.has(z.lang)).length)} files sampled)`,
        ...shapes.map((s) => `    ${s.shape.padEnd(26)} ${pad(num(s.count), 5)}   ${s.reading}`),
      ]
    : [];
  const skippedList = skipped.length
    ? [`  skipped (${skipped.length})`, ...skipped.slice(0, top).map((x) => `    ${x.reason.padEnd(11)} ${x.path}${x.bytes ? `   (${Math.round(x.bytes / 1024)} KB)` : ""}`)]
    : [];
  const partialList = partial.length
    ? [`  partial (${partial.length})   ` + partial.slice(0, 6).map((x) => `${x.path} ${(x.ranges[0] || []).join("-")}`).join(" · ") + (partial.length > 6 ? " · … (--json lists all)" : "")]
    : [];

  const line = [
    head,
    ...table,
    ...zeroList,
    ...shapeList,
    ...skippedList,
    ...partialList,
    "  an empty file is not a defect by itself — the graph names functions, methods, classes and routes;",
    '  a shape marked "parser gap" is worth one issue with the file path',
  ].join("\n");

  return {
    ok: true,
    state: "found",
    generation: gen,
    gen_id: meta.gen_id || null,
    density,
    thin,
    top,
    by_lang: byLang,
    zero_files: zero.slice(0, top),
    total_zero: zero.length,
    shapes,
    skipped,
    partial,
    line,
    trace: `GRAPH-AUDIT ${thin ? "thin" : "ok"} :: files=${meta.files || 0} symbols=${meta.symbols || 0} per_file=${density.symbols_per_file} zero=${zero.length} skipped=${skipped.length} gen=${gen}`,
    exit: 0,
  };
}

module.exports = { audit, shapeOf, firstDeclaration, SHAPES, OTHER, SHAPE_LINES, TOP_DEFAULT, TOP_CAP };
