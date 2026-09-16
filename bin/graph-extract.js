"use strict";
// ── orc graph — EXTRACTION (v1.8.0 W2) ─────────────────────────────────────
//
// One source file in, one record out: imports, symbols (with line ranges and a
// body hash), the calls each symbol makes, and the side effects it has (SQL,
// db, HTTP, env, fs). No model, no dependency.
//
// THE LADDER (D3)
//
//   1. BORROWED TOOLCHAIN — Python's own `ast` module, when a Python ≥3.8 runs
//      on this machine. Exact symbols, ranges, calls and imports. One
//      subprocess for the whole batch.
//   2. HEURISTIC — a comment/string MASK first (so a call inside a comment or a
//      string is never a call), then per-language declaration patterns, brace
//      or indentation matching for the body, and a call scan.
//
//   TypeScript's own parser is NOT borrowed in this release: no TypeScript was
//   available to test it against, and an untested extractor is worse than an
//   honest heuristic. `ORC_GRAPH_NO_BORROW=1` forces rung 2 (tests use it).
//
// What the record promises, and what it does not:
//   - `body_hash` changes when THIS symbol's text changes, and not when another
//     symbol in the same file changes. Notes (W4) key on it.
//   - calls are NAMES, not targets. Resolution is `graph-query.js`'s job, and it
//     is computed on read.
//   - dynamic dispatch, reflection, macros and eval are invisible. The graph is
//     a LOCATOR; the code is still the truth.

const crypto = require("crypto");
const { spawnSync } = require("child_process");

// @3 (W9): route handlers are symbols, and a function passed BY NAME is a `ref`.
// @4 (EW1): every record says how much of the file the extractor actually saw.
const HEURISTIC = "heuristic@4";
const MAX_CALLS_PER_SYMBOL = 200;
const MAX_EFFECTS_PER_SYMBOL = 12;

const KW = new Set(
  (
    "if for while switch catch function return typeof sizeof def class elif with not and or in " +
    "await yield case new throw else do try foreach using lock fixed func go defer select range " +
    "match fn when elseif isset empty unset array list print echo import export from lambda assert " +
    "del pass raise except finally is this self super base var let const delete instanceof " +
    "require_once include_once require include die exit"
  ).split(" ")
);

// ── text utilities ──────────────────────────────────────────────────────────
function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function lineOf(starts, pos) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

const clip = (s, n = 80) => {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

const hash = (s) => crypto.createHash("sha1").update(String(s).replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);

// Replace comment and string CONTENT with spaces, keeping every newline and
// every offset. Declarations and calls are found in the mask; string text (for
// SQL and URLs) is read back from the original at the recorded spans.
function mask(src, lang) {
  const slash = lang !== "py";
  const hashC = lang === "py" || lang === "php";
  const block = lang !== "py";
  const backtick = lang === "js" || lang === "ts" || lang === "go";
  const m = src.split("");
  const n = src.length;
  const strings = [];
  const blank = (a, b) => {
    for (let k = a; k < b && k < n; k++) if (m[k] !== "\n" && m[k] !== "\r") m[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if ((slash && c === "/" && c2 === "/") || (hashC && c === "#" && !(lang === "php" && c2 === "["))) {
      const e = src.indexOf("\n", i);
      const end = e < 0 ? n : e;
      blank(i, end);
      i = end;
      continue;
    }
    if (block && c === "/" && c2 === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (lang === "py" && (src.startsWith('"""', i) || src.startsWith("'''", i))) {
      const q = src.substr(i, 3);
      const e = src.indexOf(q, i + 3);
      const end = e < 0 ? n : e;
      strings.push({ start: i + 3, end });
      blank(i + 3, end);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (c === '"' || c === "'" || (backtick && c === "`")) {
      const verbatim = lang === "cs" && src[i - 1] === "@";
      const raw = c === "`" && lang === "go";
      let j = i + 1;
      while (j < n) {
        const d = src[j];
        if (d === "\\" && !verbatim && !raw) {
          j += 2;
          continue;
        }
        if (d === c) {
          if (verbatim && src[j + 1] === '"') {
            j += 2;
            continue;
          }
          break;
        }
        // A quote that never closes on its line is not a string (a regex
        // literal, an apostrophe in a template): stop at the line end so one
        // bad guess costs one line, not the rest of the file.
        if (d === "\n" && c !== "`" && !verbatim) break;
        j++;
      }
      strings.push({ start: i + 1, end: Math.min(j, n) });
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return { masked: m.join(""), strings };
}

// COVERAGE (EW1). A heuristic extractor can lose the thread: an opening brace
// with no partner makes a declaration run to the end of the file, and a symbol
// that hits a cap keeps only part of what it found. Neither is an error — the
// record is still useful — but the reader must be told which lines are only
// partly seen, or a card that shows nothing reads as "there is nothing".
// One extraction runs at a time, so a module-level note is enough.
let UNBALANCED = -1;
function resetCoverage() {
  UNBALANCED = -1;
}

function matchPair(s, open, a, b) {
  let d = 0;
  for (let k = open; k < s.length; k++) {
    const ch = s[k];
    if (ch === a) d++;
    else if (ch === b) {
      d--;
      if (d === 0) return k;
    }
  }
  // Only a BLOCK that really never closes is a coverage gap. Two other callers
  // land here and neither is one: a parameter list scanned speculatively, and a
  // probe whose start is not the opener at all (`s[open] !== a`), which can
  // never balance. Noting those marked 40% of this repo's own files partial —
  // a signal that fires everywhere says nothing.
  if (a === "{" && s[open] === a && (UNBALANCED < 0 || open < UNBALANCED)) UNBALANCED = open;
  return s.length - 1;
}

// After a parameter list: find the body. `requireArrow` = this is only a
// function if an `=>` follows (a `const x = (a + b)` is not one).
function bodyAfter(m, from, requireArrow) {
  const limit = Math.min(m.length, from + 400);
  for (let k = from; k < limit; k++) {
    const ch = m[k];
    if (ch === "=" && m[k + 1] === ">") {
      let j = k + 2;
      while (j < m.length && /\s/.test(m[j])) j++;
      if (m[j] === "{") return { open: j, end: matchPair(m, j, "{", "}") };
      const nl = m.indexOf("\n", j);
      return { open: j, end: nl < 0 ? m.length - 1 : nl - 1 };
    }
    if (ch === "{") return requireArrow ? null : { open: k, end: matchPair(m, k, "{", "}") };
    if (ch === ";") return requireArrow ? null : { open: k, end: k };
    if (ch === "\n" && requireArrow) {
      let j = k + 1;
      while (j < limit && (m[j] === " " || m[j] === "\t" || m[j] === "\r")) j++;
      if (m[j] !== "=" && m[j] !== ":") return null;
    }
  }
  return null;
}

// ── declarations: brace languages ───────────────────────────────────────────
function braceDefs(src, m, starts, lang, strings) {
  const defs = [];
  const defParens = new Set();
  const classes = [];
  const add = (d) => {
    if (!d.name || KW.has(d.name)) return;
    d.s = lineOf(starts, d.from);
    d.e = lineOf(starts, Math.max(d.from, d.to));
    defs.push(d);
  };
  const innermostClass = (pos) => {
    let best = null;
    for (const c of classes) if (c.open < pos && pos < c.to && (!best || c.to - c.open < best.to - best.open)) best = c;
    return best;
  };
  let x;

  if (lang === "js" || lang === "ts") {
    const CLASS = /^[ \t]*(export[ \t]+)?(?:default[ \t]+)?(?:abstract[ \t]+)?class[ \t]+([A-Za-z_$][\w$]*)[^{;]*\{/gm;
    while ((x = CLASS.exec(m))) {
      const open = x.index + x[0].length - 1;
      const to = matchPair(m, open, "{", "}");
      const c = { name: x[2], qname: x[2], kind: "class", from: x.index, to, open, exported: !!x[1] };
      classes.push(c);
      add(c);
    }
    const FN = /^[ \t]*(export[ \t]+)?(?:default[ \t]+)?(?:async[ \t]+)?function[ \t]*\*?[ \t]*([A-Za-z_$][\w$]*)[ \t]*(?:<[^>\n]*>)?[ \t]*\(/gm;
    while ((x = FN.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, false);
      defParens.add(paren);
      // `function f(a: A): B;` is an overload SIGNATURE — no body, not a symbol.
      if (!body || m[body.open] === ";") continue;
      add({ name: x[2], qname: x[2], kind: "function", from: x.index, to: body.end, exported: !!x[1] });
    }
    const ARROW = /^[ \t]*(export[ \t]+)?(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[^=\n]+)?=[ \t]*(?:async[ \t]+)?(function\b[^(\n]*\(|\(|[A-Za-z_$][\w$]*[ \t]*=>)/gm;
    while ((x = ARROW.exec(m))) {
      const end = x.index + x[0].length;
      let body;
      if (x[3].endsWith("(")) {
        const paren = end - 1;
        body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, !x[3].startsWith("function"));
        if (body) defParens.add(paren);
      } else {
        body = bodyAfter(m, m.lastIndexOf("=>", end), true);
      }
      if (!body) continue;
      add({ name: x[2], qname: x[2], kind: "function", from: x.index, to: body.end, exported: !!x[1] });
    }
    // Route handlers (Express, Koa, Fastify, Hono): `router.get("/path", mw,
    // (req, res) => { … })`. The handler is anonymous, so without this a route
    // file has NO symbol and its card is an import list — W9 measured 6 files,
    // 1 symbol on an Express app. Named `<METHOD> <path>`; the body is the whole
    // registration call, so the middleware passed to it and every call inside
    // the handler belong to the route.
    const ROUTE = /\b[A-Za-z_$][\w$]*[ \t]*\.[ \t]*(get|post|put|patch|delete|del|all|options|head)[ \t]*\(/g;
    while ((x = ROUTE.exec(m))) {
      const paren = x.index + x[0].length - 1;
      let k = paren + 1;
      while (k < m.length && /\s/.test(m[k])) k++;
      const lit = (strings || []).find((t) => t.start === k + 1);
      if (!lit) continue;
      const routePath = src.slice(lit.start, lit.end);
      if (!/^(\/|\*$)/.test(routePath) || /[\r\n]/.test(routePath)) continue;
      const close = matchPair(m, paren, "(", ")");
      // `cache.get("/k")` and `request(app).get("/orders")` pass no handler.
      if (!/=>|\bfunction\b/.test(m.slice(lit.end + 1, close))) continue;
      const name = `${x[1] === "del" ? "DELETE" : x[1].toUpperCase()} ${clip(routePath, 60)}`;
      add({ name, qname: name, kind: "route", from: x.index, to: close, exported: false });
    }
    // Members: scanned inside each class body, skipping every member body it
    // finds, so a statement inside a method is never read as a member.
    const MEMBER = /^[ \t]*((?:(?:public|private|protected|static|async|readonly|override|abstract|get|set|declare|accessor)[ \t]+)*)\*?[ \t]*(#?[A-Za-z_$][\w$]*)[ \t]*\??[ \t]*(?:<[^>\n]*>)?[ \t]*(\(|(?::[^=\n;]+)?=[ \t]*(?:async[ \t]+)?(?:\(|[A-Za-z_$][\w$]*[ \t]*=>))/gm;
    for (const c of classes) {
      MEMBER.lastIndex = c.open + 1;
      while ((x = MEMBER.exec(m)) && x.index < c.to) {
        const end = x.index + x[0].length;
        let body = null;
        let paren = null;
        if (x[3] === "(") {
          paren = end - 1;
          body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, false);
        } else if (x[3].endsWith("(")) {
          paren = end - 1;
          body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, true);
        } else {
          body = bodyAfter(m, m.lastIndexOf("=>", end), true);
        }
        if (paren != null) defParens.add(paren);
        // A member with no body is an overload signature or an abstract
        // declaration. Recording it made `NestFactoryStatic.create` three
        // symbols on nestjs/nest and every `ctx` on it an ambiguity.
        if (!body || body.end >= c.to || m[body.open] === ";") {
          if (body && body.end < c.to) MEMBER.lastIndex = Math.max(body.end + 1, end);
          continue;
        }
        const name = x[2].replace(/^#/, "");
        if (!KW.has(name)) {
          const priv = /private|protected/.test(x[1]) || x[2].startsWith("#");
          add({ name, qname: `${c.name}.${name}`, kind: "method", from: x.index, to: body.end, exported: c.exported && !priv, member: true });
        }
        MEMBER.lastIndex = Math.max(body.end + 1, end);
      }
    }
  } else if (lang === "go") {
    const TYPE = /^type[ \t]+([A-Za-z_]\w*)(?:\[[^\]]*\])?[ \t]+(?:struct|interface)[ \t]*\{/gm;
    while ((x = TYPE.exec(m))) {
      const open = x.index + x[0].length - 1;
      add({ name: x[1], qname: x[1], kind: "class", from: x.index, to: matchPair(m, open, "{", "}"), exported: /^[A-Z]/.test(x[1]) });
    }
    const FUNC = /^func[ \t]*(?:\([ \t]*\w*[ \t]*\*?[ \t]*([A-Za-z_]\w*)(?:\[[^\]]*\])?[ \t]*\)[ \t]*)?([A-Za-z_]\w*)[ \t]*(?:\[[^\]]*\])?[ \t]*\(/gm;
    while ((x = FUNC.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const close = matchPair(m, paren, "(", ")");
      const nextFunc = m.indexOf("\nfunc", close);
      const brace = m.indexOf("{", close);
      if (brace < 0 || (nextFunc >= 0 && brace > nextFunc)) continue;
      defParens.add(paren);
      const recv = x[1];
      add({
        name: x[2],
        qname: recv ? `${recv}.${x[2]}` : x[2],
        kind: recv ? "method" : "function",
        from: x.index,
        to: matchPair(m, brace, "{", "}"),
        exported: /^[A-Z]/.test(x[2]),
      });
    }
  } else if (lang === "java" || lang === "cs") {
    const CLASS = /^[ \t]*((?:(?:public|private|protected|internal|static|abstract|final|sealed|partial|readonly|unsafe)[ \t]+)*)(?:class|interface|enum|record|struct)[ \t]+([A-Za-z_]\w*)[^{;]*\{/gm;
    while ((x = CLASS.exec(m))) {
      const open = x.index + x[0].length - 1;
      const to = matchPair(m, open, "{", "}");
      const c = { name: x[2], qname: x[2], kind: "class", from: x.index, to, open, exported: /public/.test(x[1]) };
      classes.push(c);
      add(c);
    }
    const METHOD = /^[ \t]*((?:(?:public|private|protected|internal|static|final|abstract|synchronized|async|virtual|override|sealed|extern|unsafe|new|default|native|strictfp)[ \t]+)*)(?:<[^>\n]+>[ \t]+)?([\w<>\[\],.?]+(?:[ \t]*<[^>\n]*>)?)[ \t]+([A-Za-z_]\w*)[ \t]*(?:<[^>\n]*>)?[ \t]*\(/gm;
    while ((x = METHOD.exec(m))) {
      const typeWord = x[2].split(/[<.\[]/)[0];
      if (KW.has(typeWord) || KW.has(x[3])) continue;
      const paren = x.index + x[0].length - 1;
      const body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, false);
      if (!body || (m[body.open] === ";" && !/abstract|extern|native/.test(x[1]))) continue;
      defParens.add(paren);
      const owner = innermostClass(x.index);
      add({
        name: x[3],
        qname: owner ? `${owner.name}.${x[3]}` : x[3],
        kind: owner ? "method" : "function",
        from: x.index,
        to: body.end,
        exported: /public/.test(x[1]),
      });
    }
    const CTOR = /^[ \t]*(?:(?:public|private|protected|internal)[ \t]+)([A-Z]\w*)[ \t]*\(/gm;
    while ((x = CTOR.exec(m))) {
      const owner = innermostClass(x.index);
      if (!owner || owner.name !== x[1]) continue;
      const paren = x.index + x[0].length - 1;
      const body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, false);
      if (!body) continue;
      defParens.add(paren);
      add({ name: x[1], qname: `${owner.name}.${x[1]}`, kind: "method", from: x.index, to: body.end, exported: /public/.test(x[0]) });
    }
  } else if (lang === "php") {
    const CLASS = /^[ \t]*(?:(?:abstract|final|readonly)[ \t]+)*(?:class|interface|trait|enum)[ \t]+([A-Za-z_]\w*)[^{;]*\{/gm;
    while ((x = CLASS.exec(m))) {
      const open = x.index + x[0].length - 1;
      const to = matchPair(m, open, "{", "}");
      const c = { name: x[1], qname: x[1], kind: "class", from: x.index, to, open, exported: true };
      classes.push(c);
      add(c);
    }
    const FUNC = /^[ \t]*((?:(?:public|private|protected|static|abstract|final)[ \t]+)*)function[ \t]+&?([A-Za-z_]\w*)[ \t]*\(/gm;
    while ((x = FUNC.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, false);
      if (!body) continue;
      defParens.add(paren);
      const owner = innermostClass(x.index);
      add({
        name: x[2],
        qname: owner ? `${owner.name}.${x[2]}` : x[2],
        kind: owner ? "method" : "function",
        from: x.index,
        to: body.end,
        exported: !/private|protected/.test(x[1]),
      });
    }
  }

  let exportsSet = null;
  if (lang === "js" || lang === "ts") {
    exportsSet = new Set();
    for (const e of m.matchAll(/^[ \t]*export[ \t]*\{([^}]*)\}/gm))
      for (const p of e[1].split(",")) {
        const mm = /^\s*([\w$]+)/.exec(p);
        if (mm) exportsSet.add(mm[1]);
      }
    for (const e of m.matchAll(/export[ \t]+default[ \t]+([A-Za-z_$][\w$]*)/g)) exportsSet.add(e[1]);
    for (const e of m.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)[ \t]*=/g)) exportsSet.add(e[1]);
    const me = /module\.exports[ \t]*=[ \t]*(\{[^}]*\}|[A-Za-z_$][\w$]*)/.exec(m);
    if (me) {
      if (me[1][0] === "{") {
        for (const p of me[1].slice(1, -1).split(",")) {
          const mm = /^\s*([\w$]+)\s*(?::\s*([\w$]+))?/.exec(p);
          if (mm) exportsSet.add(mm[2] || mm[1]);
        }
      } else exportsSet.add(me[1]);
    }
  }
  return { defs, defParens, exportsSet };
}

// ── declarations: Python (indentation) ──────────────────────────────────────
function pyDefs(src, m, starts) {
  const lines = m.split("\n");
  const defs = [];
  const defParens = new Set();
  const stack = [];
  const width = (s) => s.replace(/\t/g, "    ").length;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const d = /^([ \t]*)(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)[ \t]*\(/.exec(L);
    const c = d ? null : /^([ \t]*)class[ \t]+([A-Za-z_]\w*)/.exec(L);
    const hit = d || c;
    if (!hit) continue;
    const indent = width(hit[1]);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    let header = i;
    if (d) {
      const paren = starts[i] + hit[0].length - 1;
      defParens.add(paren);
      header = lineOf(starts, matchPair(m, paren, "(", ")")) - 1;
    }
    let end = header;
    for (let k = header + 1; k < lines.length; k++) {
      const t = lines[k];
      if (!t.trim()) continue;
      if (width(/^[ \t]*/.exec(t)[0]) <= indent) break;
      end = k;
    }
    const chain = [];
    for (let s = stack.length - 1; s >= 0 && stack[s].kind === "class"; s--) chain.unshift(stack[s].name);
    const name = hit[2];
    defs.push({
      name,
      qname: [...chain, name].join("."),
      kind: d ? (chain.length ? "method" : "function") : "class",
      s: i + 1,
      e: end + 1,
      exported: !name.startsWith("_"),
    });
    stack.push({ indent, name, kind: d ? "function" : "class" });
  }
  return { defs, defParens };
}

// ── calls ───────────────────────────────────────────────────────────────────
const CALL = /(?:\bnew[ \t]+)?((?:[A-Za-z_$][\w$]*[ \t]*(?:\?\.|\.|->|::)[ \t]*)*[A-Za-z_$][\w$]*)[ \t]*(?:<[\w$., \t\[\]]*>)?[ \t]*\(/g;

function normCall(name) {
  let n = String(name).replace(/[ \t]*(?:\?\.|->|::)[ \t]*/g, ".").replace(/[ \t]+/g, "");
  let self = false;
  const m = /^(?:\$this|this|self|static|cls)\.(.+)$/.exec(n);
  if (m) {
    n = m[1];
    self = true;
  }
  n = n.replace(/^\$/, "").replace(/\.\$/g, ".");
  const last = n.split(".").pop();
  // A keyword after a dot is a METHOD name — `router.delete(`, `promise.catch(` —
  // and the arguments inside it (a middleware passed by name) are still scanned.
  if (!last || (KW.has(last) && !n.includes(".")) || /^\d/.test(last)) return null;
  return { name: n, self };
}

function scanCalls(m, starts, defParens) {
  const out = [];
  let x;
  CALL.lastIndex = 0;
  while ((x = CALL.exec(m))) {
    const paren = x.index + x[0].length - 1;
    if (defParens.has(paren)) continue;
    // `function (` / `def (` style anonymous forms, and the word before a
    // declaration name, are not calls.
    const before = m.slice(Math.max(0, x.index - 12), x.index);
    if (/\b(function|def|func|fn)[ \t]*\*?[ \t]*$/.test(before)) continue;
    const c = normCall(x[1]);
    if (!c) continue;
    const close = matchPair(m, paren, "(", ")");
    // `async (req, res) => …` is a parameter list, not a call to `async`.
    if (c.name === "async" && /^\s*=>/.test(m.slice(close + 1, close + 8))) continue;
    out.push({ name: c.name, line: lineOf(starts, paren), ...(c.self ? { self: true } : {}), _p: paren });
    refsIn(m, starts, paren, close, out);
  }
  return out;
}

// A function passed BY NAME — `router.post("/", requireAuth, handler)`,
// `items.map(normalize)` — is a use no call scan sees, so `requireAuth` had
// fan-in 0 on every route that used it. Each bare or dotted identifier argument
// becomes a REF. `finalize` keeps a ref only when its head is defined in this
// file or bound by an import, and resolution accepts only LOCAL or IMPORT for
// it, so a local variable passed along never becomes an edge.
const REF_WORDS = new Set(["true", "false", "null", "undefined", "nil", "None", "True", "False", "NaN", "Infinity"]);
const REF_ARG = /^\s*(?:\.\.\.|&)?((?:[A-Za-z_$][\w$]*[ \t]*(?:\?\.|\.|->|::)[ \t]*)*[A-Za-z_$][\w$]*)\s*$/;

function refsIn(m, starts, open, close, out) {
  let depth = 0;
  let a = open + 1;
  for (let k = open + 1; k <= close && k < m.length; k++) {
    const ch = m[k];
    const end = k === close;
    if (!end && (ch === "(" || ch === "[" || ch === "{")) depth++;
    else if (!end && (ch === ")" || ch === "]" || ch === "}")) depth--;
    if (!end && !(ch === "," && depth === 0)) continue;
    const piece = m.slice(a, k);
    const t = REF_ARG.exec(piece);
    if (t && !REF_WORDS.has(t[1])) {
      const c = normCall(t[1]);
      if (c) out.push({ name: c.name, line: lineOf(starts, a + piece.indexOf(t[1])), ref: true, ...(c.self ? { self: true } : {}) });
    }
    a = k + 1;
  }
}

// ── imports ─────────────────────────────────────────────────────────────────
// A statement is read from the ORIGINAL text (its path is a string), but only
// where the mask agrees the keyword is code — never inside a comment.
function codeAt(src, m, idx) {
  let k = idx;
  while (k < src.length && (src[k] === " " || src[k] === "\t")) k++;
  return m[k] === src[k] && m[k] !== " ";
}

function jsClause(cl) {
  const b = [];
  const brace = /\{([^}]*)\}/.exec(cl);
  if (brace)
    for (const part of brace[1].split(",")) {
      const p = part.trim().replace(/^type\s+/, "");
      const mm = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(p);
      if (mm) b.push({ local: mm[2] || mm[1], orig: mm[1], kind: "named" });
    }
  for (const r of cl.replace(/\{[^}]*\}/, "").split(",")) {
    const t = r.trim();
    if (!t) continue;
    const ns = /^\*\s+as\s+([\w$]+)$/.exec(t);
    if (ns) b.push({ local: ns[1], orig: "*", kind: "namespace" });
    else if (/^[\w$]+$/.test(t)) b.push({ local: t, orig: "default", kind: "default" });
  }
  return b;
}

function importsFor(lang, src, m, starts) {
  const out = [];
  const line = (i) => lineOf(starts, i);
  let x;
  if (lang === "js" || lang === "ts") {
    const IMP = /^[ \t]*import[ \t]+(?:type[ \t]+)?([\w$*{}\s,]+?)[ \t]*from[ \t]*['"]([^'"\n]+)['"]/gm;
    while ((x = IMP.exec(src))) if (codeAt(src, m, x.index)) out.push({ from: x[2], line: line(x.index), bindings: jsClause(x[1]) });
    const REQ = /(?:const|let|var)[ \t]+(\{[^}]*\}|[A-Za-z_$][\w$]*)[ \t]*=[ \t]*require\([ \t]*['"]([^'"\n]+)['"][ \t]*\)(?:\.([A-Za-z_$][\w$]*))?/g;
    while ((x = REQ.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      const bindings = [];
      if (x[1][0] === "{") {
        for (const p of x[1].slice(1, -1).split(",")) {
          const mm = /^\s*([\w$]+)\s*(?::\s*([\w$]+))?\s*$/.exec(p);
          if (mm) bindings.push({ local: mm[2] || mm[1], orig: mm[1], kind: "named" });
        }
      } else if (x[3]) bindings.push({ local: x[1], orig: x[3], kind: "named" });
      else bindings.push({ local: x[1], orig: "default", kind: "namespace" });
      out.push({ from: x[2], line: line(x.index), bindings });
    }
  } else if (lang === "py") {
    const FROM = /^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+(\([^)]*\)|[^\n#]+)/gm;
    while ((x = FROM.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      const bindings = [];
      for (const p of x[2].replace(/[()]/g, "").split(",")) {
        const mm = /^\s*(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(p);
        if (mm) bindings.push({ local: mm[2] || mm[1], orig: mm[1], kind: "named" });
      }
      out.push({ from: x[1], line: line(x.index), bindings });
    }
    const IMP = /^[ \t]*import[ \t]+([^\n#]+)/gm;
    while ((x = IMP.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      for (const p of x[1].split(",")) {
        const mm = /^\s*([\w.]+)(?:\s+as\s+(\w+))?\s*$/.exec(p);
        if (!mm) continue;
        const mod = mm[2] ? mm[1] : mm[1].split(".")[0];
        out.push({ from: mod, line: line(x.index), bindings: [{ local: mm[2] || mod, orig: mod, kind: "namespace" }] });
      }
    }
  } else if (lang === "go") {
    const addGo = (alias, p, at) => {
      const local = alias || p.split("/").pop();
      out.push({ from: p, line: line(at), bindings: alias === "_" || alias === "." ? [] : [{ local, orig: local, kind: "namespace" }] });
    };
    const ONE = /^import[ \t]+(?:([\w.]+)[ \t]+)?"([^"]+)"/gm;
    while ((x = ONE.exec(src))) if (codeAt(src, m, x.index)) addGo(x[1], x[2], x.index);
    const BLOCK = /^import[ \t]*\(([\s\S]*?)\)/gm;
    while ((x = BLOCK.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      let off = x.index + x[0].indexOf("(") + 1;
      for (const l of x[1].split("\n")) {
        const mm = /^\s*(?:([\w.]+)\s+)?"([^"]+)"/.exec(l);
        if (mm) addGo(mm[1], mm[2], off);
        off += l.length + 1;
      }
    }
  } else if (lang === "java") {
    const IMP = /^[ \t]*import[ \t]+(static[ \t]+)?([\w.]+?)(\.\*)?[ \t]*;/gm;
    while ((x = IMP.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      const parts = x[2].split(".");
      if (x[3]) out.push({ from: x[2], line: line(x.index), bindings: [], star: true });
      else if (x[1]) out.push({ from: parts.slice(0, -1).join("."), line: line(x.index), bindings: [{ local: parts[parts.length - 1], orig: parts[parts.length - 1], kind: "named" }] });
      else out.push({ from: x[2], line: line(x.index), bindings: [{ local: parts[parts.length - 1], orig: parts[parts.length - 1], kind: "named" }] });
    }
  } else if (lang === "cs") {
    const USING = /^[ \t]*using[ \t]+(?:static[ \t]+)?(?:(\w+)[ \t]*=[ \t]*)?([\w.]+)[ \t]*;/gm;
    while ((x = USING.exec(src))) if (codeAt(src, m, x.index)) out.push({ from: x[2], line: line(x.index), bindings: [] });
  } else if (lang === "php") {
    const USE = /^[ \t]*use[ \t]+(?:function[ \t]+)?([\w\\]+)(?:[ \t]+as[ \t]+(\w+))?[ \t]*;/gm;
    while ((x = USE.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      const last = x[1].split("\\").pop();
      out.push({ from: x[1], line: line(x.index), bindings: [{ local: x[2] || last, orig: last, kind: "named" }] });
    }
    const INC = /\b(?:require|include)(?:_once)?[ \t]*\(?[ \t]*['"]([^'"\n]+\.php)['"]/g;
    while ((x = INC.exec(src))) if (codeAt(src, m, x.index)) out.push({ from: x[1], line: line(x.index), bindings: [], include: true });
  }
  return out;
}

// ── effects ─────────────────────────────────────────────────────────────────
const SQL_RE = /^\s*(SELECT\s|INSERT\s+INTO\s|UPDATE\s+[\w."`\[\]]+\s+SET\s|DELETE\s+FROM\s|CREATE\s+(TABLE|INDEX|VIEW)\s|ALTER\s+TABLE\s|DROP\s+TABLE\s|WITH\s+\w+\s+AS\s*\(|MERGE\s+INTO\s)/i;
const HTTP_RE = /^(fetch|axios|axios\.(get|post|put|patch|delete|head|request)|https?\.(request|get)|requests\.(get|post|put|patch|delete|head|request)|httpx\.(get|post|put|patch|delete|request)|http\.(Get|Post|Head|NewRequest|NewRequestWithContext)|curl_exec|Http\.(get|post|put|patch|delete)|restTemplate\.\w+|webClient\.\w+|httpClient\.(get|post|put|patch|delete|send|GetAsync|PostAsync|PutAsync|DeleteAsync|SendAsync)|urllib\.request\.urlopen|urlopen)$/;
const DB_RE = /(^[\w$]+(\.[\w$]+)*\.(query|execute|executemany|executescript|raw|\$queryRaw|\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe)$)|(^prisma\.[\w$]+\.[\w$]+$)|(^knex(\.|$))|(\.objects\.\w+$)|(^(db|conn|connection|pool|cursor|session|sequelize|em|entityManager|dataSource|queryRunner|mongoose|collection)\.[\w$]+$)/;
const FS_RE = {
  js: /^(fs|fsp|fse|fs\.promises)\.(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync|rename|renameSync|copyFile|copyFileSync|outputFile|remove)$/,
  go: /^(os\.(WriteFile|Create|Remove|RemoveAll|Mkdir|MkdirAll|Rename)|ioutil\.WriteFile)$/,
  py: /^(os\.(remove|unlink|rename|makedirs|mkdir|rmdir)|shutil\.(rmtree|move|copy|copyfile)|.+\.(write_text|write_bytes))$/,
  php: /^(file_put_contents|unlink|mkdir|rmdir|rename|fwrite)$/,
  cs: /^(File\.(Write\w*|Delete|Move|Copy|AppendAll\w*|Create)|Directory\.(CreateDirectory|Delete))$/,
  java: /^(Files\.(write|writeString|delete|deleteIfExists|move|copy|createDirectories))$/,
};
FS_RE.ts = FS_RE.js;
const ENV_RE = /process\.env(?:\.([A-Za-z_]\w*)|\[\s*['"`]([^'"`]+)['"`]\s*\])|os\.environ(?:\.get\(\s*|\[\s*)['"]([^'"]+)['"]|os\.getenv\(\s*['"]([^'"]+)['"]|os\.Getenv\(\s*"([^"]+)"|System\.getenv\(\s*"([^"]+)"|Environment\.GetEnvironmentVariable\(\s*"([^"]+)"|\bgetenv\(\s*['"]([^'"]+)['"]|\$_ENV\[\s*['"]([^'"]+)['"]/g;

function stringAt(src, strings, pos) {
  let k = pos;
  while (k < src.length && /\s/.test(src[k])) k++;
  if (!/['"`]/.test(src[k] || "")) return null;
  const s = strings.find((t) => t.start === k + 1);
  return s ? src.slice(s.start, s.end) : null;
}

function parenFor(src, starts, call) {
  if (call._p != null) return call._p;
  const ls = starts[call.line - 1] || 0;
  const le = starts[call.line] || src.length;
  const last = call.name.split(".").pop();
  const i = src.indexOf(last, ls);
  if (i < 0 || i >= le) return null;
  const p = src.indexOf("(", i + last.length);
  return p >= 0 && p < le ? p : null;
}

function effectsOf(lang, src, m, starts, strings, calls) {
  const out = [];
  for (const s of strings) {
    const text = src.slice(s.start, s.end);
    if (SQL_RE.test(text)) out.push({ type: "sql", text: clip(text), line: lineOf(starts, s.start) });
  }
  let x;
  ENV_RE.lastIndex = 0;
  while ((x = ENV_RE.exec(src))) {
    if (!codeAt(src, m, x.index)) continue;
    const name = x.slice(1).find(Boolean);
    if (name) out.push({ type: "env", text: name, line: lineOf(starts, x.index) });
  }
  const fsRe = FS_RE[lang];
  for (const c of calls) {
    if (HTTP_RE.test(c.name)) {
      const p = parenFor(src, starts, c);
      const url = p != null ? stringAt(src, strings, p + 1) : null;
      out.push({ type: "http", text: url ? `${c.name} ${clip(url, 60)}` : c.name, line: c.line });
    } else if (DB_RE.test(c.name)) {
      out.push({ type: "db", text: c.name, line: c.line });
    } else if (fsRe && fsRe.test(c.name)) {
      out.push({ type: "fs", text: c.name, line: c.line });
    } else if (lang === "py" && c.name === "open") {
      const p = parenFor(src, starts, c);
      if (p != null && /^[^)]*?,\s*(?:mode\s*=\s*)?['"][wax]/.test(src.slice(p + 1, p + 120))) out.push({ type: "fs", text: "open (write)", line: c.line });
    }
  }
  return out;
}

// ── assembly ────────────────────────────────────────────────────────────────
function finalize(rel, lang, src, m, starts, strings, defs, calls, imports, exportsSet, extractor) {
  const nLines = starts.length;
  const owner = new Int32Array(nLines + 2).fill(-1);
  const order = defs.map((_, i) => i).sort((a, b) => defs[b].e - defs[b].s - (defs[a].e - defs[a].s));
  for (const i of order) for (let L = defs[i].s; L <= defs[i].e && L <= nLines; L++) owner[L] = i;

  const syms = defs.map((d) => ({
    id: "",
    name: d.name,
    qname: d.qname || d.name,
    kind: d.kind,
    lines: [d.s, d.e],
    exported: !!(d.exported || (exportsSet && exportsSet.has(d.name))),
    body_hash: "",
    calls: [],
    effects: [],
  }));
  const mod = { id: "", name: "<module>", qname: "<module>", kind: "module", lines: [1, nLines], exported: false, body_hash: "", calls: [], effects: [] };
  const at = (line) => (owner[line] >= 0 ? syms[owner[line]] : mod);

  const known = new Set(defs.map((d) => d.name));
  for (const imp of imports || []) for (const b of imp.bindings || []) known.add(b.local);
  // A cap is a coverage gap, and the gap starts at the FIRST thing that was
  // dropped — not at the top of the symbol. A file whose `<module>` holds 400
  // calls is fully seen down to call 200; saying the whole file is partial
  // would hide where the record actually stops.
  const cutAt = new Map();
  const cut = (t, line) => {
    const was = cutAt.get(t);
    if (was === undefined || line < was) cutAt.set(t, line);
  };
  for (const c of calls) {
    if (c.ref && !known.has(c.self ? c.name.split(".").pop() : c.name.split(".")[0])) continue;
    const t = at(c.line);
    if (t.calls.length < MAX_CALLS_PER_SYMBOL)
      t.calls.push({ name: c.name, line: c.line, ...(c.self ? { self: true } : {}), ...(c.ref ? { ref: true } : {}) });
    else cut(t, c.line);
  }
  // A function passed as an argument runs no HTTP, SQL or fs effect by being passed.
  for (const ef of effectsOf(lang, src, m, starts, strings, calls.filter((c) => !c.ref))) {
    const t = at(ef.line);
    if (t.effects.length >= MAX_EFFECTS_PER_SYMBOL) {
      cut(t, ef.line);
      continue;
    }
    if (!t.effects.some((e) => e.type === ef.type && e.text === ef.text)) t.effects.push(ef);
  }

  // The partial RANGES, merged, in line order. A cap gives the tail from the
  // first dropped line; an unbalanced block gives everything from it to the end
  // of the file.
  const ranges = [];
  for (const [t, line] of cutAt) ranges.push([line, t.lines[1]]);
  if (UNBALANCED >= 0) ranges.push([lineOf(starts, UNBALANCED), nLines]);
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const partial = [];
  for (const r of ranges) {
    const last = partial[partial.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else partial.push([r[0], r[1]]);
  }

  const seen = new Map();
  for (const s of syms) {
    const a = starts[s.lines[0] - 1] || 0;
    const b = s.lines[1] < nLines ? starts[s.lines[1]] : src.length;
    s.body_hash = hash(src.slice(a, b));
    let id = `${rel}#${s.qname}`;
    const k = seen.get(id) || 0;
    seen.set(id, k + 1);
    if (k) id += `~${k + 1}`;
    s.id = id;
  }
  if (mod.calls.length || mod.effects.length) {
    mod.id = `${rel}#<module>`;
    syms.push(mod);
  }
  return { extractor, imports, symbols: syms, coverage: partial.length ? "partial" : "full", ...(partial.length ? { partial } : {}) };
}

function extractOne(item, borrowed) {
  const { rel, lang, src } = item;
  resetCoverage();
  const { masked: m, strings } = mask(src, lang);
  const starts = lineIndex(src);
  if (borrowed) {
    const calls = [];
    for (const c of borrowed.calls) {
      const n = normCall(c.name);
      if (n) calls.push({ name: n.name, line: c.line, ...(n.self ? { self: true } : {}), ...(c.ref ? { ref: true } : {}) });
    }
    return finalize(rel, lang, src, m, starts, strings, borrowed.defs, calls, borrowed.imports, null, borrowed.extractor);
  }
  if (lang === "py") {
    const { defs, defParens } = pyDefs(src, m, starts);
    return finalize(rel, lang, src, m, starts, strings, defs, scanCalls(m, starts, defParens), importsFor(lang, src, m, starts), null, HEURISTIC);
  }
  const { defs, defParens, exportsSet } = braceDefs(src, m, starts, lang, strings);
  return finalize(rel, lang, src, m, starts, strings, defs, scanCalls(m, starts, defParens), importsFor(lang, src, m, starts), exportsSet, HEURISTIC);
}

// ── the borrowed Python parser ──────────────────────────────────────────────
const PY_AST = String.raw`
import ast, sys, json
def dotted(n):
    parts = []
    while isinstance(n, ast.Attribute):
        parts.append(n.attr)
        n = n.value
    if isinstance(n, ast.Name):
        parts.append(n.id)
        return ".".join(reversed(parts))
    return None
class V(ast.NodeVisitor):
    def __init__(s):
        s.defs = []; s.calls = []; s.imports = []; s.stack = []
    def qual(s, name):
        chain = []
        for kind, n in reversed(s.stack):
            if kind != "class":
                break
            chain.append(n)
        chain.reverse()
        return ".".join(chain + [name]), bool(chain)
    def visit_ClassDef(s, node):
        q, _ = s.qual(node.name)
        s.defs.append({"name": node.name, "qname": q, "kind": "class", "s": node.lineno, "e": node.end_lineno or node.lineno, "exported": not node.name.startswith("_")})
        s.stack.append(("class", node.name)); s.generic_visit(node); s.stack.pop()
    def visit_FunctionDef(s, node):
        q, inclass = s.qual(node.name)
        s.defs.append({"name": node.name, "qname": q, "kind": "method" if inclass else "function", "s": node.lineno, "e": node.end_lineno or node.lineno, "exported": not node.name.startswith("_")})
        s.stack.append(("function", node.name)); s.generic_visit(node); s.stack.pop()
    visit_AsyncFunctionDef = visit_FunctionDef
    def visit_Call(s, node):
        name = dotted(node.func)
        if name:
            s.calls.append({"name": name, "line": node.lineno})
        for a in list(node.args) + [k.value for k in node.keywords]:
            r = dotted(a)
            if r:
                s.calls.append({"name": r, "line": getattr(a, "lineno", node.lineno), "ref": True})
        s.generic_visit(node)
    def visit_Import(s, node):
        for a in node.names:
            mod = a.name if a.asname else a.name.split(".")[0]
            s.imports.append({"from": mod, "line": node.lineno, "bindings": [{"local": a.asname or mod, "orig": mod, "kind": "namespace"}]})
    def visit_ImportFrom(s, node):
        mod = "." * (node.level or 0) + (node.module or "")
        b = [{"local": a.asname or a.name, "orig": a.name, "kind": "named"} for a in node.names if a.name != "*"]
        s.imports.append({"from": mod, "line": node.lineno, "bindings": b})
items = json.loads(sys.stdin.buffer.read().decode("utf-8"))
out = {}
for it in items:
    try:
        with open(it["abs"], "r", encoding="utf-8", errors="replace") as f:
            tree = ast.parse(f.read())
        v = V(); v.visit(tree)
        out[it["rel"]] = {"defs": v.defs, "calls": v.calls, "imports": v.imports}
    except Exception:
        out[it["rel"]] = None
sys.stdout.buffer.write(json.dumps(out).encode("utf-8"))
`;

let pythonProbe;
function findPython() {
  if (pythonProbe !== undefined) return pythonProbe;
  pythonProbe = null;
  const cands = [];
  if (process.env.ORC_GRAPH_PYTHON) cands.push([process.env.ORC_GRAPH_PYTHON]);
  cands.push(["python3"], ["python"], ["py", "-3"]);
  for (const [cmd, ...pre] of cands) {
    const r = spawnSync(cmd, [...pre, "-c", "import sys;print('%d.%d' % sys.version_info[:2]);print(sys.version_info >= (3, 8))"], {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    });
    if (r.status === 0 && /True/.test(r.stdout || "")) {
      pythonProbe = { cmd, pre, ver: (r.stdout || "").split(/\r?\n/)[0].trim() };
      break;
    }
  }
  return pythonProbe;
}

function runPythonAst(items) {
  const py = findPython();
  if (!py) return null;
  const r = spawnSync(py.cmd, [...py.pre, "-c", PY_AST], {
    input: JSON.stringify(items.map((i) => ({ rel: i.rel, abs: i.abs }))),
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    timeout: 300000,
    windowsHide: true,
  });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    return { map: JSON.parse(r.stdout), extractor: `python-ast@${py.ver}` };
  } catch (_) {
    return null;
  }
}

// items: [{ rel, abs, lang, src }] → Map<rel, { extractor, imports, symbols }>
function extractBatch(items) {
  const out = new Map();
  const pys = items.filter((i) => i.lang === "py");
  const ast = pys.length && !process.env.ORC_GRAPH_NO_BORROW ? runPythonAst(pys) : null;
  for (const it of items) {
    const b = ast && ast.map[it.rel];
    try {
      out.set(it.rel, extractOne(it, b ? { ...b, extractor: ast.extractor } : null));
    } catch (_) {
      // A file the extractor cannot read is an empty record, never a failed
      // update: one pathological file must not take the whole map down.
      out.set(it.rel, { extractor: HEURISTIC, error: "extract-failed", imports: [], symbols: [] });
    }
  }
  return out;
}

module.exports = { HEURISTIC, MAX_CALLS_PER_SYMBOL, MAX_EFFECTS_PER_SYMBOL, extractBatch, extractOne, mask, normCall, _findPython: findPython };
